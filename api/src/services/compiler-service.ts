import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CompileResult, CompileError } from '../types.js';

const execFileAsync = promisify(execFile);

const DEFAULT_NARGO_TOML = (name: string) => `[package]
name = "${name}"
type = "contract"

[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-nr", tag = "v4.0.0-devnet.2-patch.0", directory = "aztec" }
`;

function getAztecBinaryPath(): string {
  if (process.env.AZTEC_PATH) return process.env.AZTEC_PATH;
  const home = os.homedir();
  return path.join(home, '.aztec', 'current', 'node_modules', '.bin', 'aztec');
}

/**
 * Parse compile errors from nargo/aztec stderr output.
 *
 * Nargo error format:
 *   error: <message>
 *      ┌─ src/main.nr:18:9
 *      │
 *   18 │     storage.count.write(0);
 *      │             -----
 *
 * Also handles:
 *   error[E0001]: <message>
 *      ┌─ src/main.nr:5:1
 */
function parseCompileErrors(stderr: string): CompileError[] {
  const errors: CompileError[] = [];
  const lines = stderr.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match "error: ..." or "error[E0001]: ..." or "warning: ..."
    const msgMatch = line.match(/^\s*(error(?:\[[^\]]+\])?|warning):\s*(.+)/i);
    if (!msgMatch) continue;

    const type = msgMatch[1].toLowerCase().startsWith('error') ? 'error' as const : 'warning' as const;
    const message = msgMatch[2].trim();

    // Look ahead for file location: "┌─ src/main.nr:18:9"
    let file: string | undefined;
    let errorLine: number | undefined;
    let column: number | undefined;

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const locMatch = lines[j].match(/[┌─]+\s+([^:]+):(\d+):(\d+)/);
      if (locMatch) {
        file = locMatch[1].trim();
        errorLine = parseInt(locMatch[2], 10);
        column = parseInt(locMatch[3], 10);
        break;
      }
    }

    errors.push({ message, file, line: errorLine, column, type });
  }

  return errors;
}

export class CompilerService {
  private aztecBin: string;

  constructor() {
    this.aztecBin = getAztecBinaryPath();
  }

  async compile(
    sources: Record<string, string>,
    contractName: string,
  ): Promise<CompileResult> {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'aztec-compile-'),
    );

    try {
      // Write all source files first
      for (const [filePath, content] of Object.entries(sources)) {
        const fullPath = path.join(tmpDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      // If the user's project includes a Nargo.toml, use it as-is.
      // Otherwise generate a default one.
      const nargoPath = path.join(tmpDir, 'Nargo.toml');
      try {
        await fs.access(nargoPath);
      } catch {
        await fs.writeFile(nargoPath, DEFAULT_NARGO_TOML(contractName.toLowerCase()));
      }

      // Ensure src/main.nr exists (aztec compile requires it)
      const mainNr = path.join(tmpDir, 'src', 'main.nr');
      try {
        await fs.access(mainNr);
      } catch {
        const srcDir = path.join(tmpDir, 'src');
        try {
          const files = await fs.readdir(srcDir);
          const nrFiles = files.filter((f) => f.endsWith('.nr'));
          if (nrFiles.length === 1 && nrFiles[0] !== 'main.nr') {
            const content = await fs.readFile(path.join(srcDir, nrFiles[0]), 'utf-8');
            await fs.writeFile(mainNr, content);
          }
        } catch {
          // No src/ dir at all
        }
      }

      // Run aztec compile from the project directory
      let stdout = '';
      let stderr = '';
      try {
        const result = await execFileAsync(
          this.aztecBin,
          ['compile'],
          {
            timeout: 300_000,
            cwd: tmpDir,
            env: { ...process.env },
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
          },
        );
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (err: unknown) {
        // execFile throws on non-zero exit — capture stdout/stderr from the error
        const execErr = err as { stdout?: string; stderr?: string; message?: string };
        stdout = execErr.stdout || '';
        stderr = execErr.stderr || '';

        // Parse structured errors from stderr
        const errors = parseCompileErrors(stderr);
        if (errors.length > 0) {
          // Return a structured error response with parsed locations
          const errorMessages = errors
            .filter((e) => e.type === 'error')
            .map((e) => {
              const loc = e.line ? ` (${e.file || 'unknown'}:${e.line}:${e.column || 0})` : '';
              return `${e.message}${loc}`;
            });

          const error = new Error(
            `Compilation failed:\n${errorMessages.join('\n')}`,
          ) as Error & { errors: CompileError[] };
          error.errors = errors;
          throw error;
        }

        // No structured errors — throw raw message
        throw new Error(
          `Compilation failed:\n${stderr || execErr.message || 'Unknown error'}`,
        );
      }

      // Collect warnings from stderr (filter out progress noise)
      const warnings = stderr
        ? stderr
            .split('\n')
            .filter((l) => l.trim().length > 0)
            .filter((l) => !l.includes('Compiling') && !l.includes('Finished'))
        : [];

      // Parse any warnings with locations
      const parsedErrors = parseCompileErrors(stderr);

      // Read artifacts from target/
      const targetDir = path.join(tmpDir, 'target');
      const artifacts: object[] = [];

      try {
        const files = await fs.readdir(targetDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const content = await fs.readFile(
              path.join(targetDir, file),
              'utf-8',
            );
            artifacts.push(JSON.parse(content));
          }
        }
      } catch {
        if (warnings.length > 0) {
          throw new Error(`Compilation failed:\n${warnings.join('\n')}`);
        }
      }

      if (artifacts.length === 0) {
        throw new Error(
          `No artifacts produced. Output:\n${stdout}\n${stderr}`,
        );
      }

      return {
        artifacts,
        warnings,
        errors: parsedErrors.length > 0 ? parsedErrors : undefined,
      };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
