import { useState, useEffect } from 'react';
import remixClient from './remix-client';
import Header from './components/Header';
import CompileTab from './components/CompileTab';
import DeployTab from './components/DeployTab';
import InteractTab from './components/InteractTab';
import type { NetworkInfo, AccountInfo, ContractArtifact, DeployedContract } from './types';

type Tab = 'compile' | 'deploy' | 'interact';

export default function App() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('compile');
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [artifacts, setArtifacts] = useState<ContractArtifact[]>([]);
  const [deployedContracts, setDeployedContracts] = useState<DeployedContract[]>([]);

  // Wait for Remix plugin client to connect
  useEffect(() => {
    remixClient.onload(() => {
      setReady(true);
    });
  }, []);

  function handleConnect(info: NetworkInfo) {
    setNetworkInfo(info);
  }

  function handleCompiled(newArtifacts: ContractArtifact[]) {
    setArtifacts((prev) => {
      // Replace artifacts with same name, add new ones
      const map = new Map(prev.map((a) => [a.name, a]));
      for (const a of newArtifacts) {
        map.set(a.name, a);
      }
      return Array.from(map.values());
    });
    setActiveTab('deploy');
  }

  function handleDeployed(contract: DeployedContract) {
    setDeployedContracts((prev) => [...prev, contract]);
    setActiveTab('interact');
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
            onContractAdded={(contract) =>
              setDeployedContracts((prev) => [...prev, contract])
            }
          />
        )}
      </div>
    </div>
  );
}
