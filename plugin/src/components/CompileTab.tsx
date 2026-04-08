import { useState } from 'react';
import remixClient from '../remix-client';
import * as api from '../api';
import type { ContractArtifact } from '../types';

interface CompileTabProps {
  onCompiled: (artifacts: ContractArtifact[]) => void;
}

export default function CompileTab({ onCompiled }: CompileTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [currentFile, setCurrentFile] = useState('');

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

  async function collectSources(filePath: string): Promise<Record<string, string>> {
    const sources: Record<string, string> = {};

    // Read the main file
    const content = await remixClient.readFile(filePath);

    // Determine the project root (parent of src/)
    const parts = filePath.split('/');
    const srcIndex = parts.lastIndexOf('src');

    if (srcIndex >= 0) {
      // File is inside a src/ directory — collect all .nr files in src/
      const projectRoot = parts.slice(0, srcIndex).join('/');
      const srcDir = projectRoot ? `${projectRoot}/src` : 'src';

      // Also include Nargo.toml if it exists in the project root
      if (projectRoot) {
        try {
          const nargoToml = await remixClient.readFile(`${projectRoot}/Nargo.toml`);
          sources['Nargo.toml'] = nargoToml;
        } catch {
          // No Nargo.toml — backend will generate one
        }
      }

      try {
        const entries = await remixClient.readDir(srcDir);
        for (const [name, info] of Object.entries(entries)) {
          if (!info.isDirectory && name.endsWith('.nr')) {
            const fullPath = `${srcDir}/${name}`;
            const src = await remixClient.readFile(fullPath);
            sources[`src/${name}`] = src;
          }
        }
      } catch {
        // Fallback: just use the single file
        sources['src/main.nr'] = content;
      }
    } else {
      // File is not in src/ — treat it as the main source
      sources['src/main.nr'] = content;
    }

    // Ensure we have at least the current file
    if (Object.keys(sources).length === 0) {
      sources['src/main.nr'] = content;
    }

    return sources;
  }

  function inferContractName(filePath: string): string {
    const fileName = filePath.split('/').pop() || 'main.nr';
    const name = fileName.replace('.nr', '');
    // Convert to PascalCase
    return name
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
  }

  async function handleCompile() {
    setLoading(true);
    setError('');
    setSuccess('');
    setWarnings([]);

    try {
      await remixClient.clearAnnotations();

      const filePath = await detectCurrentFile();
      if (!filePath) return;

      if (!filePath.endsWith('.nr')) {
        setError('Current file is not a Noir (.nr) file.');
        return;
      }

      await remixClient.logToTerminal(`Compiling ${filePath}...`);

      const sources = await collectSources(filePath);
      const contractName = inferContractName(filePath);

      const result = await api.compile(sources, contractName);

      // Write artifacts to Remix filesystem
      for (const artifact of result.artifacts) {
        const art = artifact as ContractArtifact;
        const artifactPath = `artifacts/${art.name || contractName}.json`;
        await remixClient.writeFile(artifactPath, JSON.stringify(art, null, 2));
      }

      const artifactNames = result.artifacts.map(
        (a) => (a as ContractArtifact).name || contractName,
      );
      setSuccess(`Compiled successfully: ${artifactNames.join(', ')}`);
      setWarnings(result.warnings || []);
      onCompiled(result.artifacts as ContractArtifact[]);

      await remixClient.logToTerminal(
        `Compilation successful. Artifacts: ${artifactNames.join(', ')}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Compilation failed';
      setError(msg);
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
          The plugin will collect all source files and compile using <code>aztec compile</code>.
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

      {error && <div className="error-msg">{error}</div>}
      {success && <div className="success-msg">{success}</div>}
      {warnings.length > 0 && (
        <div className="warning-msg">
          <strong>Warnings:</strong>
          <ul style={{ margin: '4px 0 0 16px' }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
