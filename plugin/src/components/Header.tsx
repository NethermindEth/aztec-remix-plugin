import { useState } from 'react';
import * as api from '../api';
import type { NetworkInfo, AccountInfo } from '../types';

interface HeaderProps {
  networkInfo: NetworkInfo | null;
  accounts: AccountInfo[];
  onConnect: (info: NetworkInfo) => void;
  onAccountsLoaded: (accounts: AccountInfo[]) => void;
}

export default function Header({ networkInfo, accounts, onConnect, onAccountsLoaded }: HeaderProps) {
  const [nodeUrl, setNodeUrl] = useState('http://localhost:8080');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [proverMode, setProverMode] = useState('none');
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const connected = networkInfo?.connected ?? false;

  async function handleConnect() {
    setLoading(true);
    setError('');
    try {
      const info = await api.connect(nodeUrl);
      onConnect(info);

      try {
        const accounts = await api.getAccounts();
        onAccountsLoaded(accounts);
      } catch {
        // No accounts yet
      }

      // Fetch current prover mode
      try {
        const { mode } = await api.getProverMode();
        setProverMode(mode);
      } catch {
        // Default to none
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

  async function handleCreateAccount() {
    if (!newAlias.trim()) return;
    setCreating(true);
    setError('');
    try {
      // Use first available account as fee payer (new accounts can't pay for themselves)
      const feePayer = accounts[0]?.alias
        ? `accounts:${accounts[0].alias}`
        : accounts[0]?.address;
      await api.createAccount(newAlias.trim(), feePayer);
      // Refresh account list
      const updatedAccounts = await api.getAccounts();
      onAccountsLoaded(updatedAccounts);
      setNewAlias('');
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setCreating(false);
    }
  }

  async function handleProverChange(mode: string) {
    try {
      const result = await api.setProverMode(mode);
      setProverMode(result.mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set prover mode');
    }
  }

  async function handleCleanArtifacts() {
    setCleaning(true);
    setError('');
    setStatusMsg('');
    try {
      const result = await api.cleanArtifacts();
      setStatusMsg(`Cleaned ${result.deleted} artifact(s)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clean artifacts');
    } finally {
      setCleaning(false);
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

      {/* Connection */}
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
        <>
          {/* Account management */}
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-small"
              onClick={handleImportTestAccounts}
              disabled={importing}
            >
              {importing ? <><span className="spinner" /> Importing...</> : 'Import Test Accounts'}
            </button>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => setShowCreate(!showCreate)}
            >
              {showCreate ? 'Cancel' : 'Create Account'}
            </button>
          </div>

          {showCreate && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="Account alias (e.g. myaccount)"
                style={{ flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAccount()}
              />
              <button
                className="btn btn-primary btn-small"
                onClick={handleCreateAccount}
                disabled={creating || !newAlias.trim()}
              >
                {creating ? <span className="spinner" /> : 'Create'}
              </button>
            </div>
          )}

          {/* Settings row */}
          <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', fontSize: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <label style={{ margin: 0, fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>Prover:</label>
              <select
                value={proverMode}
                onChange={(e) => handleProverChange(e.target.value)}
                style={{ width: 'auto', padding: '2px 6px', fontSize: 11 }}
              >
                <option value="none">None (fast)</option>
                <option value="wasm">WASM</option>
                <option value="native">Native</option>
              </select>
            </div>

            <button
              className="btn btn-secondary btn-small"
              onClick={handleCleanArtifacts}
              disabled={cleaning}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              {cleaning ? <span className="spinner" /> : 'Clean Artifacts'}
            </button>
          </div>
        </>
      )}

      {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}
      {statusMsg && <div className="success-msg" style={{ marginTop: 8 }}>{statusMsg}</div>}
    </div>
  );
}
