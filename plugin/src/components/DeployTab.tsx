import { useState, useMemo } from 'react';
import * as api from '../api';
import AccountSelector from './AccountSelector';
import type { ContractArtifact, AccountInfo, DeployedContract, AbiFunction } from '../types';

interface DeployTabProps {
  artifacts: ContractArtifact[];
  accounts: AccountInfo[];
  onDeployed: (contract: DeployedContract) => void;
}

export default function DeployTab({ artifacts, accounts, onDeployed }: DeployTabProps) {
  const [selectedArtifact, setSelectedArtifact] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [contractAlias, setContractAlias] = useState('');
  const [constructorArgs, setConstructorArgs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ address: string; txHash: string } | null>(null);

  const artifact = artifacts[selectedArtifact];

  // Find the constructor/initializer function
  const constructor: AbiFunction | undefined = useMemo(() => {
    if (!artifact) return undefined;
    return artifact.functions.find((f) => f.isInitializer);
  }, [artifact]);

  const constructorParams = constructor?.parameters || [];

  // Use account alias (e.g. "accounts:test0") for aztec-wallet CLI
  function getAccountRef(address: string): string {
    const acct = accounts.find((a) => a.address === address);
    if (acct?.alias) return `accounts:${acct.alias}`;
    return address;
  }

  async function handleDeploy() {
    if (!artifact || !selectedAccount) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const args = constructorParams.map((p) => {
        const val = constructorArgs[p.name] || '';
        if (p.type.kind === 'integer' || p.type.kind === 'field') {
          return val || '0';
        }
        if (p.type.kind === 'boolean') {
          return val === 'true';
        }
        return val;
      });

      const deployResult = await api.deploy(
        artifact,
        args,
        getAccountRef(selectedAccount),
        contractAlias || undefined,
      );

      setResult(deployResult);
      onDeployed({
        name: contractAlias || artifact.name,
        address: deployResult.address,
        artifact,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deployment failed');
    } finally {
      setLoading(false);
    }
  }

  if (artifacts.length === 0) {
    return (
      <div className="empty-state">
        No compiled artifacts found.<br />
        Compile a contract first.
      </div>
    );
  }

  return (
    <div>
      <div className="section">
        <div className="section-title">Deploy Contract</div>

        <div className="form-group">
          <label>Contract Artifact</label>
          <select
            value={selectedArtifact}
            onChange={(e) => {
              setSelectedArtifact(Number(e.target.value));
              setConstructorArgs({});
              setResult(null);
            }}
          >
            {artifacts.map((a, i) => (
              <option key={i} value={i}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Contract Alias (optional)</label>
          <input
            type="text"
            value={contractAlias}
            onChange={(e) => setContractAlias(e.target.value)}
            placeholder="e.g. counter"
          />
        </div>

        <AccountSelector
          accounts={accounts}
          selected={selectedAccount}
          onChange={setSelectedAccount}
        />

        {constructorParams.length > 0 && (
          <div className="section">
            <div className="section-title" style={{ fontSize: 11 }}>
              Constructor Arguments
            </div>
            {constructorParams.map((p) => (
              <div className="form-group" key={p.name}>
                <label>
                  {p.name} <span style={{ opacity: 0.6 }}>({p.type.kind})</span>
                </label>
                <input
                  type="text"
                  value={constructorArgs[p.name] || ''}
                  onChange={(e) =>
                    setConstructorArgs((prev) => ({ ...prev, [p.name]: e.target.value }))
                  }
                  placeholder={`Enter ${p.name}`}
                />
              </div>
            ))}
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          onClick={handleDeploy}
          disabled={loading || !selectedAccount}
        >
          {loading ? (
            <>
              <span className="spinner" /> Deploying...
            </>
          ) : (
            'Deploy'
          )}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}
      {result && (
        <div className="success-msg">
          <strong>Deployed!</strong><br />
          Address: <code>{result.address}</code><br />
          Tx: <code>{result.txHash}</code>
        </div>
      )}
    </div>
  );
}
