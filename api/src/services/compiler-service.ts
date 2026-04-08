import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CompileResult } from '../types.js';

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
        // Nargo.toml exists from user sources — use it
      } catch {
        // No Nargo.toml provided — generate default
        await fs.writeFile(nargoPath, DEFAULT_NARGO_TOML(contractName.toLowerCase()));
      }

      // Ensure src/main.nr exists (aztec compile requires it)
      const mainNr = path.join(tmpDir, 'src', 'main.nr');
      try {
        await fs.access(mainNr);
      } catch {
        // If no src/main.nr but we have other .nr files, find the most likely entry
        const srcDir = path.join(tmpDir, 'src');
        try {
          const files = await fs.readdir(srcDir);
          const nrFiles = files.filter((f) => f.endsWith('.nr'));
          if (nrFiles.length === 1 && nrFiles[0] !== 'main.nr') {
            // Single .nr file that isn't main.nr — copy it as main.nr
            const content = await fs.readFile(path.join(srcDir, nrFiles[0]), 'utf-8');
            await fs.writeFile(mainNr, content);
          }
        } catch {
          // No src/ dir at all — sources may use a flat structure
        }
      }

      // Run aztec compile from the project directory
      const { stdout, stderr } = await execFileAsync(
        this.aztecBin,
        ['compile'],
        {
          timeout: 300_000, // 5 min timeout (first compile downloads deps)
          cwd: tmpDir,
          env: { ...process.env },
        },
      );

      // Collect warnings from stderr (filter out progress noise)
      const warnings = stderr
        ? stderr
            .split('\n')
            .filter((l) => l.trim().length > 0)
            .filter((l) => !l.includes('Compiling') && !l.includes('Finished'))
        : [];

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

      return { artifacts, warnings };
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
