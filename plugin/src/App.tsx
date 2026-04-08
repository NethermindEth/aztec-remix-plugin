import { useState, useEffect, useCallback } from 'react';
import remixClient from './remix-client';
import Header from './components/Header';
import CompileTab from './components/CompileTab';
import DeployTab from './components/DeployTab';
import InteractTab from './components/InteractTab';
import AuthWitTab from './components/AuthWitTab';
import TransactionsTab from './components/TransactionsTab';
import type { NetworkInfo, AccountInfo, ContractArtifact, DeployedContract } from './types';

type Tab = 'compile' | 'deploy' | 'interact' | 'authwit' | 'txs';

const DEPLOYED_CONTRACTS_PATH = '.aztec/deployed-contracts.json';

export default function App() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('compile');
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [artifacts, setArtifacts] = useState<ContractArtifact[]>([]);
  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([]);

  useEffect(() => {
    remixClient.onload(async () => {
      setReady(true);
      try {
        const raw = await remixClient.readFile(DEPLOYED_CONTRACTS_PATH);
        const contracts = JSON.parse(raw) as DeployedContract[];
        if (Array.isArray(contracts)) {
          setDeployedContracts(contracts);
        }
      } catch {
        // No persisted contracts
      }
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
              // Skip malformed
            }
          }
        }
      } catch {
        // No artifacts/ directory
      }
    });
  }, []);

  const persistContracts = useCallback(async (contracts: DeployedContract[]) => {
    try {
      await remixClient.writeFile(DEPLOYED_CONTRACTS_PATH, JSON.stringify(contracts, null, 2));
    } catch {
      // Best-effort
    }
  }, []);

  function handleConnect(info: NetworkInfo) {
    setNetworkInfo(info);
  }

  function handleCompiled(newArtifacts: ContractArtifact[]) {
    setArtifacts((prev) => {
      const map = new Map(prev.map((a) => [a.name, a]));
      for (const a of newArtifacts) map.set(a.name, a);
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
        {(['compile', 'deploy', 'interact', 'authwit', 'txs'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {{ compile: 'Compile', deploy: 'Deploy', interact: 'Interact', authwit: 'AuthWit', txs: 'Txs' }[tab]}
          </button>
        ))}
      </div>

      <div className="plugin-content">
        {activeTab === 'compile' && (
          <CompileTab onCompiled={handleCompiled} />
        )}
        {activeTab === 'deploy' && (
          <DeployTab
            artifacts={artifacts}
            accounts={accounts}
            deployedContracts={deployedContracts}
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
        {activeTab === 'authwit' && (
          <AuthWitTab
            contracts={deployedContracts}
            accounts={accounts}
          />
        )}
        {activeTab === 'txs' && (
          <TransactionsTab />
        )}
      </div>
    </div>
  );
}
