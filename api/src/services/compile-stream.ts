import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

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

export interface StreamCallbacks {
  onStdout: (data: string) => void;
  onStderr: (data: string) => void;
  onComplete: (result: { artifacts: object[]; exitCode: number }) => void;
  onError: (error: string) => void;
}

/**
 * Compile with real-time streaming of stdout/stderr via callbacks.
 * Used by the WebSocket compile endpoint.
 */
export async function compileWithStream(
  sources: Record<string, string>,
  contractName: string,
  callbacks: StreamCallbacks,
): Promise<void> {
  const aztecBin = getAztecBinaryPath();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aztec-compile-'));

  try {
    // Write source files
    for (const [filePath, content] of Object.entries(sources)) {
      const fullPath = path.join(tmpDir, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }

    // Nargo.toml
    const nargoPath = path.join(tmpDir, 'Nargo.toml');
    try {
      await fs.access(nargoPath);
    } catch {
      await fs.writeFile(nargoPath, DEFAULT_NARGO_TOML(contractName.toLowerCase()));
    }

    // Ensure src/main.nr
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
        // No src/ dir
      }
    }

    // Spawn aztec compile with streaming
    const child = spawn(aztecBin, ['compile'], {
      cwd: tmpDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Set a timeout
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      callbacks.onError('Compilation timed out after 5 minutes');
    }, 300_000);

    child.stdout.on('data', (chunk: Buffer) => {
      callbacks.onStdout(chunk.toString());
    });

    child.stderr.on('data', (chunk: Buffer) => {
      callbacks.onStderr(chunk.toString());
    });

    child.on('close', async (exitCode) => {
      clearTimeout(timeout);

      // Read artifacts
      const artifacts: object[] = [];
      const targetDir = path.join(tmpDir, 'target');

      try {
        const files = await fs.readdir(targetDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const content = await fs.readFile(path.join(targetDir, file), 'utf-8');
            artifacts.push(JSON.parse(content));
          }
        }
      } catch {
        // No artifacts produced
      }

      callbacks.onComplete({ artifacts, exitCode: exitCode ?? 1 });

      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });

    child.on('error', async (err) => {
      clearTimeout(timeout);
      callbacks.onError(err.message);
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Failed to start compilation');
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
