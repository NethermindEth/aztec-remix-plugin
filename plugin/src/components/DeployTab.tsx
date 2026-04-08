import { useState, useMemo } from 'react';
import * as api from '../api';
import AccountSelector from './AccountSelector';
import { validateArg, validateAlias, buildArgs, getAccountRef, LIMITS } from '../utils';
import { isInitializer, getFunctionParams } from '../types';
import type { ContractArtifact, AccountInfo, DeployedContract, AbiFunction } from '../types';

interface DeployTabProps {
  artifacts: ContractArtifact[];
  accounts: AccountInfo[];
  deployedContracts: DeployedContract[];
  onDeployed: (contract: DeployedContract) => void;
}

export default function DeployTab({ artifacts, accounts, deployedContracts, onDeployed }: DeployTabProps) {
  const [selectedArtifact, setSelectedArtifact] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [contractAlias, setContractAlias] = useState('');
  const [constructorArgs, setConstructorArgs] = useState<Record<string, string>>({});
  const [argErrors, setArgErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ address: string; txHash: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const artifact = artifacts[selectedArtifact];

  const constructor: AbiFunction | undefined = useMemo(() => {
    if (!artifact) return undefined;
    return artifact.functions.find((f) => isInitializer(f));
  }, [artifact]);

  const constructorParams = constructor ? getFunctionParams(constructor) : [];

  // Check if alias already exists
  const aliasExists = contractAlias.trim() &&
    deployedContracts.some((c) => c.name.toLowerCase() === contractAlias.trim().toLowerCase());

  function handleArgChange(paramName: string, value: string) {
    setConstructorArgs((prev) => ({ ...prev, [paramName]: value }));
    // Validate on change
    const param = constructorParams.find((p) => p.name === paramName);
    if (param) {
      const err = validateArg(param, value);
      setArgErrors((prev) => {
        const next = { ...prev };
        if (err) next[paramName] = err;
        else delete next[paramName];
        return next;
      });
    }
  }

  async function handleDeploy() {
    if (!artifact || !selectedAccount) return;

    // Validate alias length
    if (contractAlias) {
      const aliasErr = validateAlias(contractAlias);
      if (aliasErr) {
        setError(aliasErr);
        return;
      }
    }

    // Validate all args
    const errors: Record<string, string> = {};
    for (const p of constructorParams) {
      const err = validateArg(p, constructorArgs[p.name] || '');
      if (err) errors[p.name] = err;
    }
    if (Object.keys(errors).length > 0) {
      setArgErrors(errors);
      setError('Fix argument validation errors before deploying');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setElapsed(0);

    // Timer for long operations
    const startTime = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);

    try {
      const args = buildArgs(constructorParams, constructorArgs);

      const deployResult = await api.deploy(
        artifact,
        args,
        getAccountRef(selectedAccount, accounts),
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
      clearInterval(timer);
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
              setArgErrors({});
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
            onChange={(e) => setContractAlias(e.target.value.slice(0, LIMITS.ALIAS_MAX_LENGTH))}
            placeholder="e.g. counter"
          />
          {aliasExists && (
            <div style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 3 }}>
              Alias "{contractAlias}" already exists — deploying will overwrite it
            </div>
          )}
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
                  {p.name}{' '}
                  <span style={{ opacity: 0.6 }}>
                    ({p.type.kind}{p.type.width ? p.type.width : ''})
                  </span>
                </label>
                <input
                  type="text"
                  value={constructorArgs[p.name] || ''}
                  onChange={(e) => handleArgChange(p.name, e.target.value)}
                  placeholder={`Enter ${p.name}`}
                  maxLength={LIMITS.ARG_MAX_LENGTH}
                  style={argErrors[p.name] ? { borderColor: 'var(--red)' } : undefined}
                />
                {argErrors[p.name] && (
                  <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }}>
                    {argErrors[p.name]}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          className="btn btn-primary btn-full"
          onClick={handleDeploy}
          disabled={loading || !selectedAccount || Object.keys(argErrors).length > 0}
        >
          {loading ? (
            <>
              <span className="spinner" /> Deploying...{elapsed > 5 ? ` (${elapsed}s)` : ''}
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
