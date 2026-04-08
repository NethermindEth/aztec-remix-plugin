import { useState } from 'react';
import * as api from '../api';
import type { NetworkInfo, AccountInfo } from '../types';

interface HeaderProps {
  networkInfo: NetworkInfo | null;
  onConnect: (info: NetworkInfo) => void;
  onAccountsLoaded: (accounts: AccountInfo[]) => void;
}

export default function Header({ networkInfo, onConnect, onAccountsLoaded }: HeaderProps) {
  const [nodeUrl, setNodeUrl] = useState('http://localhost:8080');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const connected = networkInfo?.connected ?? false;

  async function handleConnect() {
    setLoading(true);
    setError('');
    try {
      const info = await api.connect(nodeUrl);
      onConnect(info);

      // Auto-fetch accounts after connecting
      try {
        const accounts = await api.getAccounts();
        onAccountsLoaded(accounts);
      } catch {
        // No accounts yet — that's fine
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleImportTestAccounts() {
    setImporting(true);
    setError('');
    try {
      const accounts = await api.importTestAccounts();
      onAccountsLoaded(accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import test accounts');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="header">
      <div className="header-title">
        <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
        Aztec Plugin
        {networkInfo?.blockNumber != null && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400 }}>
            Block #{networkInfo.blockNumber}
          </span>
        )}
      </div>
      <div className="connection-row">
        <input
          type="text"
          value={nodeUrl}
          onChange={(e) => setNodeUrl(e.target.value)}
          placeholder="Aztec Node URL"
          disabled={loading}
        />
        <button
          className="btn btn-primary btn-small"
          onClick={handleConnect}
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : connected ? 'Reconnect' : 'Connect'}
        </button>
      </div>
      {connected && (
        <div style={{ marginTop: 6 }}>
          <button
            className="btn btn-secondary btn-small"
            onClick={handleImportTestAccounts}
            disabled={importing}
          >
            {importing ? <><span className="spinner" /> Importing...</> : 'Import Test Accounts'}
          </button>
        </div>
      )}
      {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
