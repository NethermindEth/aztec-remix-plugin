import { useState, useRef, useEffect } from 'react';
import remixClient from '../remix-client';
import * as api from '../api';
import { ApiError } from '../api';
import type { ContractArtifact, CompileError } from '../types';

const WS_URL = 'ws://localhost:3001/ws/compile';

interface CompileTabProps {
  onCompiled: (artifacts: ContractArtifact[]) => void;
}

export default function CompileTab({ onCompiled }: CompileTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [compileErrors, setCompileErrors] = useState<CompileError[]>([]);
  const [currentFile, setCurrentFile] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  async function detectCurrentFile() {
    try {
      const file = await remixClient.getCurrentFile();
      setCurrentFile(file);
      return file;
    } catch {
      setError('No file is currently open in the editor. Open a .nr file first.');
      return null;
    }
  }

  /** Recursively walk a directory in Remix, collecting all .nr files */
  async function walkDir(
    dir: string,
    relativeTo: string,
    sources: Record<string, string>,
  ): Promise<void> {
    try {
      const entries = await remixClient.readDir(dir);
      for (const [name, info] of Object.entries(entries)) {
        const fullPath = `${dir}/${name}`;
        const relPath = relativeTo ? `${relativeTo}/${name}` : name;
        if (info.isDirectory) {
          await walkDir(fullPath, relPath, sources);
        } else if (name.endsWith('.nr')) {
          const src = await remixClient.readFile(fullPath);
          sources[relPath] = src;
        }
      }
    } catch {
      // Directory doesn't exist or unreadable
    }
  }

  async function collectSources(filePath: string): Promise<Record<string, string>> {
    const sources: Record<string, string> = {};
    const content = await remixClient.readFile(filePath);
    const parts = filePath.split('/');
    const srcIndex = parts.lastIndexOf('src');

    if (srcIndex >= 0) {
      const projectRoot = parts.slice(0, srcIndex).join('/');
      const srcDir = projectRoot ? `${projectRoot}/src` : 'src';

      // Include Nargo.toml if it exists
      if (projectRoot) {
        try {
          const nargoToml = await remixClient.readFile(`${projectRoot}/Nargo.toml`);
          sources['Nargo.toml'] = nargoToml;
        } catch {
          // No Nargo.toml — backend generates default
        }
      }

      // Recursively collect all .nr files from src/
      await walkDir(srcDir, 'src', sources);

      // Fallback if recursive walk found nothing
      if (!Object.keys(sources).some((k) => k.endsWith('.nr'))) {
        sources['src/main.nr'] = content;
      }
    } else {
      sources['src/main.nr'] = content;
    }

    if (Object.keys(sources).length === 0) {
      sources['src/main.nr'] = content;
    }

    return sources;
  }

  function inferContractName(filePath: string): string {
    const fileName = filePath.split('/').pop() || 'main.nr';
    const name = fileName.replace('.nr', '');
    return name
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }

  async function annotateErrors(errors: CompileError[]) {
    for (const err of errors) {
      if (err.line) {
        await remixClient.addAnnotation({
          row: err.line - 1,
          column: (err.column || 1) - 1,
          text: err.message,
          type: err.type,
        });
      }
    }
    const firstError = errors.find((e) => e.type === 'error' && e.line);
    if (firstError?.line) {
      try {
        await remixClient.call('editor', 'gotoLine' as any, firstError.line - 1, (firstError.column || 1) - 1);
      } catch {
        // gotoLine may not be available
      }
    }
  }

  /** Compile via WebSocket for real-time log streaming */
  function compileViaWs(
    sources: Record<string, string>,
    contractName: string,
  ): Promise<ContractArtifact[]> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        ws.send(JSON.stringify({ sources, contractName }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            type: 'stdout' | 'stderr' | 'status' | 'complete' | 'error';
            data: unknown;
          };

          switch (msg.type) {
            case 'stdout':
              setLogs((prev) => [...prev, msg.data as string]);
              break;
            case 'stderr':
              setLogs((prev) => [...prev, msg.data as string]);
              break;
            case 'status':
              setLogs((prev) => [...prev, `[status] ${msg.data}`]);
              break;
            case 'complete': {
              const result = msg.data as {
                success: boolean;
                artifacts: ContractArtifact[];
                exitCode: number;
              };
              if (result.success && result.artifacts.length > 0) {
                resolve(result.artifacts);
              } else {
                reject(new Error('Compilation failed (exit code ' + result.exitCode + ')'));
              }
              break;
            }
            case 'error':
              reject(new Error(msg.data as string));
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onerror = () => {
        // WebSocket failed — will fall back to REST
        reject(new Error('__ws_unavailable__'));
      };

      ws.onclose = () => {
        // If promise hasn't resolved/rejected yet, it will timeout naturally
      };
    });
  }

  async function handleCompile() {
    setLoading(true);
    setError('');
    setSuccess('');
    setCompileErrors([]);
    setLogs([]);

    try {
      await remixClient.clearAnnotations();

      const filePath = await detectCurrentFile();
      if (!filePath) return;

      if (!filePath.endsWith('.nr')) {
        setError('Current file is not a Noir (.nr) file.');
        return;
      }

      await remixClient.logToTerminal(`Compiling ${filePath}...`);
      setLogs(['Compiling ' + filePath + '...']);

      const sources = await collectSources(filePath);
      const contractName = inferContractName(filePath);

      let resultArtifacts: ContractArtifact[];

      // Try WebSocket first for streaming logs, fall back to REST
      try {
        resultArtifacts = await compileViaWs(sources, contractName);
      } catch (wsErr) {
        if (wsErr instanceof Error && wsErr.message === '__ws_unavailable__') {
          // WebSocket unavailable — fall back to REST
          setLogs((prev) => [...prev, '[fallback] Using REST API...']);
          const result = await api.compile(sources, contractName);

          if (result.errors && result.errors.length > 0) {
            await annotateErrors(result.errors);
            setCompileErrors(result.errors.filter((e) => e.type === 'warning'));
          }

          resultArtifacts = result.artifacts as ContractArtifact[];
        } else {
          throw wsErr;
        }
      }

      // Write artifacts to Remix filesystem
      for (const art of resultArtifacts) {
        const artifactPath = `artifacts/${art.name || contractName}.json`;
        await remixClient.writeFile(artifactPath, JSON.stringify(art, null, 2));
      }

      const artifactNames = resultArtifacts.map((a) => a.name || contractName);
      setSuccess(`Compiled successfully: ${artifactNames.join(', ')}`);
      setLogs((prev) => [...prev, `Compilation complete: ${artifactNames.join(', ')}`]);
      onCompiled(resultArtifacts);

      await remixClient.logToTerminal(
        `Compilation successful. Artifacts: ${artifactNames.join(', ')}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Compilation failed';
      setError(msg);
      setLogs((prev) => [...prev, `ERROR: ${msg}`]);

      if (err instanceof ApiError && err.errors) {
        setCompileErrors(err.errors);
        await annotateErrors(err.errors);
      }

      await remixClient.logToTerminal(`Compilation error: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="section">
        <div className="section-title">Compile</div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Open a <code>.nr</code> contract file in the editor, then click Compile.
        </p>

        {currentFile && (
          <div className="form-group">
            <label>Current File</label>
            <input type="text" value={currentFile} readOnly />
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          onClick={handleCompile}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" /> Compiling...
            </>
          ) : (
            'Compile'
          )}
        </button>
      </div>

      {/* Real-time compilation log */}
      {logs.length > 0 && (
        <div className="section">
          <div className="section-title">Compilation Log</div>
          <div className="result-box" ref={logRef} style={{ maxHeight: 160, fontSize: 11 }}>
            {logs.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}

      {compileErrors.length > 0 && (
        <div className="section">
          <div className="section-title">
            {compileErrors.some((e) => e.type === 'error') ? 'Errors' : 'Warnings'}
          </div>
          {compileErrors.map((e, i) => (
            <div
              key={i}
              className={e.type === 'error' ? 'error-msg' : 'warning-msg'}
              style={{ marginBottom: 6 }}
            >
              {e.file && e.line && (
                <span style={{ opacity: 0.7, fontSize: 11 }}>
                  {e.file}:{e.line}{e.column ? `:${e.column}` : ''} —{' '}
                </span>
              )}
              {e.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
