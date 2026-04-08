import { useState } from 'react';
import * as api from '../api';
import AccountSelector from './AccountSelector';
import type { DeployedContract, AccountInfo, AbiFunction, ContractArtifact } from '../types';

interface InteractTabProps {
  contracts: DeployedContract[];
  accounts: AccountInfo[];
  artifacts: ContractArtifact[];
  onContractAdded: (contract: DeployedContract) => void;
}

// Internal/protocol functions that should be hidden from the interact UI
const HIDDEN_FUNCTIONS = new Set([
  'public_dispatch',
  'process_message',
  'sync_state',
  'sync_notes',
  'process_log',
]);

function getFunctionType(fn: AbiFunction): 'private' | 'public' | 'utility' {
  if (fn.functionType === 'unconstrained') return 'utility';
  if (fn.functionType === 'secret') return 'private';
  return 'public';
}

function FunctionCard({
  fn,
  contractAddress,
  accounts,
  selectedAccount,
}: {
  fn: AbiFunction;
  contractAddress: string;
  accounts: AccountInfo[];
  selectedAccount: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const fnType = getFunctionType(fn);
  const isReadOnly = fnType === 'utility';

  // Use account alias for aztec-wallet CLI
  function getAccountRef(address: string): string {
    const acct = accounts.find((a) => a.address === address);
    if (acct?.alias) return `accounts:${acct.alias}`;
    return address;
  }

  async function handleExecute(action: 'send' | 'simulate') {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const argValues = fn.parameters.map((p) => {
        const val = args[p.name] || '';
        if (p.type.kind === 'integer' || p.type.kind === 'field') {
          return val || '0';
        }
        if (p.type.kind === 'boolean') {
          return val === 'true';
        }
        return val;
      });

      const res = await api.interact(
        contractAddress,
        fn.name,
        argValues,
        action,
        getAccountRef(selectedAccount),
      );

      const display = res.txHash
        ? `${res.result}\nTx: ${res.txHash}`
        : res.result;
      setResult(display);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fn-card">
      <div className="fn-card-header" onClick={() => setExpanded(!expanded)}>
        <span className="fn-name">{fn.name}</span>
        <span className={`fn-badge ${fnType}`}>{fnType}</span>
      </div>

      {expanded && (
        <div className="fn-card-body">
          {fn.parameters.length > 0 &&
            fn.parameters.map((p) => (
              <div className="form-group" key={p.name}>
                <label>
                  {p.name} <span style={{ opacity: 0.6 }}>({p.type.kind})</span>
                </label>
                <input
                  type="text"
                  value={args[p.name] || ''}
                  onChange={(e) =>
                    setArgs((prev) => ({ ...prev, [p.name]: e.target.value }))
                  }
                  placeholder={`Enter ${p.name}`}
                />
              </div>
            ))}

          <div style={{ display: 'flex', gap: 6 }}>
            {isReadOnly ? (
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handleExecute('simulate')}
                disabled={loading || !selectedAccount}
              >
                {loading ? <span className="spinner" /> : 'Simulate'}
              </button>
            ) : (
              <>
                <button
                  className="btn btn-primary btn-small"
                  onClick={() => handleExecute('send')}
                  disabled={loading || !selectedAccount}
                >
                  {loading ? <span className="spinner" /> : 'Send'}
                </button>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => handleExecute('simulate')}
                  disabled={loading || !selectedAccount}
                >
                  Simulate
                </button>
              </>
            )}
          </div>

          {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}
          {result !== null && (
            <div className="result-box" style={{ marginTop: 8 }}>
              {result}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InteractTab({ contracts, accounts, artifacts, onContractAdded }: InteractTabProps) {
  const [selectedContract, setSelectedContract] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.address || '');

  // "At Address" state
  const [atAddress, setAtAddress] = useState('');
  const [atArtifactIdx, setAtArtifactIdx] = useState(0);

  const [atLoading, setAtLoading] = useState(false);
  const [atError, setAtError] = useState('');

  async function handleAtAddress() {
    if (!atAddress || artifacts.length === 0) return;
    const artifact = artifacts[atArtifactIdx];
    setAtLoading(true);
    setAtError('');

    // Register in the wallet so aztec-wallet knows about this contract
    try {
      await api.registerContract({
        address: atAddress,
        artifact,
        alias: artifact.name.toLowerCase(),
      });
    } catch {
      // Registration may fail if already registered — that's OK
    }

    onContractAdded({
      name: artifact.name,
      address: atAddress,
      artifact,
    });
    setAtAddress('');
    setAtLoading(false);
  }

  if (contracts.length === 0) {
    return (
      <div>
        <div className="section">
          <div className="section-title">Interact</div>
          <div className="empty-state" style={{ padding: '12px 0' }}>
            No deployed contracts yet.
          </div>
        </div>

        {artifacts.length > 0 && (
          <div className="section">
            <div className="section-title">At Address</div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Connect to an already-deployed contract by providing its address.
            </p>
            <div className="form-group">
              <label>Artifact</label>
              <select value={atArtifactIdx} onChange={(e) => setAtArtifactIdx(Number(e.target.value))}>
                {artifacts.map((a, i) => <option key={i} value={i}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Contract Address</label>
              <input
                type="text"
                value={atAddress}
                onChange={(e) => setAtAddress(e.target.value)}
                placeholder="0x..."
              />
            </div>
            <button className="btn btn-secondary btn-full" onClick={handleAtAddress} disabled={!atAddress}>
              Load Contract
            </button>
          </div>
        )}
      </div>
    );
  }

  const contract = contracts[selectedContract];

  // Filter out internal/initializer/protocol functions
  const callableFunctions = contract.artifact.functions.filter(
    (f) => !f.isInternal && !f.isInitializer && !HIDDEN_FUNCTIONS.has(f.name),
  );

  const privateFns = callableFunctions.filter((f) => getFunctionType(f) === 'private');
  const publicFns = callableFunctions.filter((f) => getFunctionType(f) === 'public');
  const utilityFns = callableFunctions.filter((f) => getFunctionType(f) === 'utility');

  return (
    <div>
      <div className="section">
        <div className="section-title">Interact</div>

        <div className="form-group">
          <label>Contract</label>
          <select
            value={selectedContract}
            onChange={(e) => setSelectedContract(Number(e.target.value))}
          >
            {contracts.map((c, i) => (
              <option key={i} value={i}>
                {c.name} ({c.address.slice(0, 10)}...{c.address.slice(-6)})
              </option>
            ))}
          </select>
        </div>

        <AccountSelector
          accounts={accounts}
          selected={selectedAccount}
          onChange={setSelectedAccount}
        />
      </div>

      {privateFns.length > 0 && (
        <div className="section">
          <div className="section-title">Private Functions</div>
          {privateFns.map((fn) => (
            <FunctionCard
              key={fn.name}
              fn={fn}
              contractAddress={contract.address}
              accounts={accounts}
              selectedAccount={selectedAccount}
            />
          ))}
        </div>
      )}

      {publicFns.length > 0 && (
        <div className="section">
          <div className="section-title">Public Functions</div>
          {publicFns.map((fn) => (
            <FunctionCard
              key={fn.name}
              fn={fn}
              contractAddress={contract.address}
              accounts={accounts}
              selectedAccount={selectedAccount}
            />
          ))}
        </div>
      )}

      {utilityFns.length > 0 && (
        <div className="section">
          <div className="section-title">Utility Functions (Read-Only)</div>
          {utilityFns.map((fn) => (
            <FunctionCard
              key={fn.name}
              fn={fn}
              contractAddress={contract.address}
              accounts={accounts}
              selectedAccount={selectedAccount}
            />
          ))}
        </div>
      )}

      {callableFunctions.length === 0 && (
        <div className="empty-state">No callable functions found in this contract.</div>
      )}

      {artifacts.length > 0 && (
        <div className="section" style={{ marginTop: 16 }}>
          <div className="section-title">At Address</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={atArtifactIdx}
              onChange={(e) => setAtArtifactIdx(Number(e.target.value))}
              style={{ flex: '0 0 auto', width: 'auto' }}
            >
              {artifacts.map((a, i) => <option key={i} value={i}>{a.name}</option>)}
            </select>
            <input
              type="text"
              value={atAddress}
              onChange={(e) => setAtAddress(e.target.value)}
              placeholder="0x..."
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary btn-small" onClick={handleAtAddress} disabled={!atAddress}>
              Load
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
