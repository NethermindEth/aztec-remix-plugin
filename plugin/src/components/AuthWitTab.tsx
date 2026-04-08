import { useState } from 'react';
import * as api from '../api';
import AccountSelector from './AccountSelector';
import { getAccountRef } from '../utils';
import { isInitializer, getFunctionParams, HIDDEN_FUNCTIONS } from '../types';
import type { DeployedContract, AccountInfo, AbiFunction } from '../types';

interface AuthWitTabProps {
  contracts: DeployedContract[];
  accounts: AccountInfo[];
}

export default function AuthWitTab({ contracts, accounts }: AuthWitTabProps) {
  const [mode, setMode] = useState<'private' | 'public'>('private');
  const [selectedContract, setSelectedContract] = useState(0);
  const [selectedFunction, setSelectedFunction] = useState('');
  const [caller, setCaller] = useState('');
  const [from, setFrom] = useState(accounts[0]?.address || '');
  const [args, setArgs] = useState<Record<string, string>>({});
  const [alias, setAlias] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  if (contracts.length === 0) {
    return (
      <div className="empty-state">
        No deployed contracts.<br />
        Deploy a contract first, then create auth witnesses.
      </div>
    );
  }

  const contract = contracts[selectedContract];
  const callableFns = contract.artifact.functions.filter(
    (f) => !isInitializer(f) && !HIDDEN_FUNCTIONS.has(f.name),
  );

  const selectedFn = callableFns.find((f) => f.name === selectedFunction);

  async function handleSubmit() {
    if (!selectedFunction || !caller || !from) return;
    setLoading(true);
    setError('');
    setResult('');

    try {
      const fnArgs = selectedFn ? getFunctionParams(selectedFn).map((p) => args[p.name] || '0') : [];

      if (mode === 'private') {
        const res = await api.createAuthWit({
          functionName: selectedFunction,
          caller: getAccountRef(caller, accounts),
          contractAddress: contract.address,
          artifact: contract.artifact,
          from: getAccountRef(from, accounts),
          args: fnArgs.length > 0 ? fnArgs : undefined,
          alias: alias || undefined,
        });
        setResult(res.output);
      } else {
        const res = await api.authorizeAction({
          functionName: selectedFunction,
          caller: getAccountRef(caller, accounts),
          contractAddress: contract.address,
          from: getAccountRef(from, accounts),
          args: fnArgs.length > 0 ? fnArgs : undefined,
        });
        setResult(res.output);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="section">
        <div className="section-title">Authorization Witness</div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Authorize another account to call a function on your behalf.
          <strong> Private</strong> creates an auth witness (off-chain).
          <strong> Public</strong> authorizes the action on-chain.
        </p>

        {/* Mode toggle */}
        <div className="form-group">
          <label>Type</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`btn btn-small ${mode === 'private' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('private')}
            >
              Private (AuthWit)
            </button>
            <button
              className={`btn btn-small ${mode === 'public' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMode('public')}
            >
              Public (Authorize)
            </button>
          </div>
        </div>

        {/* Contract */}
        <div className="form-group">
          <label>Contract</label>
          <select
            value={selectedContract}
            onChange={(e) => {
              setSelectedContract(Number(e.target.value));
              setSelectedFunction('');
              setArgs({});
            }}
          >
            {contracts.map((c, i) => (
              <option key={i} value={i}>
                {c.name} ({c.address.slice(0, 10)}...{c.address.slice(-6)})
              </option>
            ))}
          </select>
        </div>

        {/* Function */}
        <div className="form-group">
          <label>Function to Authorize</label>
          <select
            value={selectedFunction}
            onChange={(e) => {
              setSelectedFunction(e.target.value);
              setArgs({});
            }}
          >
            <option value="">Select function...</option>
            {callableFns.map((f) => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
          </select>
        </div>

        {/* Function args */}
        {selectedFn && getFunctionParams(selectedFn).length > 0 && (
          <div className="form-group">
            <label>Function Arguments</label>
            {getFunctionParams(selectedFn).map((p) => (
              <div key={p.name} style={{ marginBottom: 4 }}>
                <input
                  type="text"
                  value={args[p.name] || ''}
                  onChange={(e) => setArgs((prev) => ({ ...prev, [p.name]: e.target.value }))}
                  placeholder={`${p.name} (${p.type.kind})`}
                />
              </div>
            ))}
          </div>
        )}

        {/* Authorizing account (from) */}
        <div className="form-group">
          <label>Authorizing Account (from)</label>
          <AccountSelector accounts={accounts} selected={from} onChange={setFrom} />
        </div>

        {/* Caller */}
        <div className="form-group">
          <label>Caller (account being authorized)</label>
          <AccountSelector accounts={accounts} selected={caller} onChange={setCaller} />
        </div>

        {/* Alias (private only) */}
        {mode === 'private' && (
          <div className="form-group">
            <label>Alias (optional)</label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="e.g. my-authwit"
            />
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          onClick={handleSubmit}
          disabled={loading || !selectedFunction || !caller || !from}
        >
          {loading ? (
            <><span className="spinner" /> {mode === 'private' ? 'Creating...' : 'Authorizing...'}</>
          ) : (
            mode === 'private' ? 'Create Auth Witness' : 'Authorize Action'
          )}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {result && (
        <div className="success-msg">
          <strong>{mode === 'private' ? 'Auth Witness Created' : 'Action Authorized'}</strong>
          <div className="result-box" style={{ marginTop: 6 }}>{result}</div>
        </div>
      )}
    </div>
  );
}
