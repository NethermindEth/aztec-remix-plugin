import { useState, useEffect, useCallback } from 'react';
import remixClient from './remix-client';
import Header from './components/Header';
import CompileTab from './components/CompileTab';
import DeployTab from './components/DeployTab';
import InteractTab from './components/InteractTab';
import type { NetworkInfo, AccountInfo, ContractArtifact, DeployedContract } from './types';

type Tab = 'compile' | 'deploy' | 'interact';

const DEPLOYED_CONTRACTS_PATH = '.aztec/deployed-contracts.json';

export default function App() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('compile');
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [artifacts, setArtifacts] = useState<ContractArtifact[]>([]);
  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([]);

  // Wait for Remix plugin client to connect, then load persisted state
  useEffect(() => {
    remixClient.onload(async () => {
      setReady(true);
      // Load persisted deployed contracts
      try {
        const raw = await remixClient.readFile(DEPLOYED_CONTRACTS_PATH);
        const contracts = JSON.parse(raw) as DeployedContract[];
        if (Array.isArray(contracts)) {
          setDeployedContracts(contracts);
        }
      } catch {
        // No persisted contracts yet — that's fine
      }
      // Load persisted artifacts from artifacts/ directory
      try {
        const entries = await remixClient.readDir('artifacts');
        for (const [name, info] of Object.entries(entries)) {
          if (!info.isDirectory && name.endsWith('.json')) {
            try {
              const content = await remixClient.readFile(`artifacts/${name}`);
              const artifact = JSON.parse(content) as ContractArtifact;
              if (artifact.name && artifact.functions) {
                setArtifacts((prev) => {
                  if (prev.some((a) => a.name === artifact.name)) return prev;
                  return [...prev, artifact];
                });
              }
            } catch {
              // Skip malformed artifacts
            }
          }
        }
      } catch {
        // No artifacts/ directory yet
      }
    });
  }, []);

  // Persist deployed contracts whenever the list changes
  const persistContracts = useCallback(async (contracts: DeployedContract[]) => {
    try {
      await remixClient.writeFile(
        DEPLOYED_CONTRACTS_PATH,
        JSON.stringify(contracts, null, 2),
      );
    } catch {
      // Silently fail — persistence is best-effort
    }
  }, []);

  function handleConnect(info: NetworkInfo) {
    setNetworkInfo(info);
  }

  function handleCompiled(newArtifacts: ContractArtifact[]) {
    setArtifacts((prev) => {
      const map = new Map(prev.map((a) => [a.name, a]));
      for (const a of newArtifacts) {
        map.set(a.name, a);
      }
      return Array.from(map.values());
    });
    setActiveTab('deploy');
  }

  function handleDeployed(contract: DeployedContract) {
    setDeployedContracts((prev) => {
      const next = [...prev, contract];
      persistContracts(next);
      return next;
    });
    setActiveTab('interact');
  }

  function handleContractAdded(contract: DeployedContract) {
    setDeployedContracts((prev) => {
      const next = [...prev, contract];
      persistContracts(next);
      return next;
    });
  }

  if (!ready) {
    return (
      <div className="plugin-container">
        <div className="empty-state" style={{ marginTop: 40 }}>
          <span className="spinner" style={{ marginBottom: 12, display: 'block' }} />
          Connecting to Remix IDE...
        </div>
      </div>
    );
  }

  return (
    <div className="plugin-container">
      <Header
        networkInfo={networkInfo}
        accounts={accounts}
        onConnect={handleConnect}
        onAccountsLoaded={setAccounts}
      />

      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'compile' ? 'active' : ''}`}
          onClick={() => setActiveTab('compile')}
        >
          Compile
        </button>
        <button
          className={`tab-btn ${activeTab === 'deploy' ? 'active' : ''}`}
          onClick={() => setActiveTab('deploy')}
        >
          Deploy
        </button>
        <button
          className={`tab-btn ${activeTab === 'interact' ? 'active' : ''}`}
          onClick={() => setActiveTab('interact')}
        >
          Interact
        </button>
      </div>

      <div className="plugin-content">
        {activeTab === 'compile' && (
          <CompileTab onCompiled={handleCompiled} />
        )}
        {activeTab === 'deploy' && (
          <DeployTab
            artifacts={artifacts}
            accounts={accounts}
            onDeployed={handleDeployed}
          />
        )}
        {activeTab === 'interact' && (
          <InteractTab
            contracts={deployedContracts}
            accounts={accounts}
            artifacts={artifacts}
            onContractAdded={handleContractAdded}
          />
        )}
      </div>
    </div>
  );
}
