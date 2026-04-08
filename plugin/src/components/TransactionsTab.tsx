import { useState } from 'react';
import * as api from '../api';

export default function TransactionsTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState('');
  const [txHash, setTxHash] = useState('');
  const [detailOutput, setDetailOutput] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  async function handleFetchRecent() {
    setLoading(true);
    setError('');
    setOutput('');
    try {
      const result = await api.getRecentTxs();
      setOutput(result.output || 'No recent transactions.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get transactions');
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup() {
    if (!txHash.trim()) return;
    setDetailLoading(true);
    setError('');
    setDetailOutput('');
    try {
      const result = await api.getTxDetails(txHash.trim());
      setDetailOutput(result.output || 'No details found.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get transaction details');
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div>
      <div className="section">
        <div className="section-title">Recent Transactions</div>
        <button
          className="btn btn-secondary btn-full"
          onClick={handleFetchRecent}
          disabled={loading}
        >
          {loading ? <><span className="spinner" /> Loading...</> : 'Load Recent Transactions'}
        </button>

        {output && (
          <div className="result-box" style={{ marginTop: 8 }}>
            {output}
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">Transaction Lookup</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="Transaction hash (0x...)"
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          />
          <button
            className="btn btn-primary btn-small"
            onClick={handleLookup}
            disabled={detailLoading || !txHash.trim()}
          >
            {detailLoading ? <span className="spinner" /> : 'Lookup'}
          </button>
        </div>

        {detailOutput && (
          <div className="result-box" style={{ marginTop: 8 }}>
            {detailOutput}
          </div>
        )}
      </div>

      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}
