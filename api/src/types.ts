// ── Request Types ──

export interface CompileRequest {
  sources: Record<string, string>; // path → source content
  contractName: string;
}

export interface ConnectRequest {
  nodeUrl: string;
}

export interface DeployRequest {
  artifact: object; // Full contract artifact JSON
  args: unknown[];
  from: string; // Account alias or address
  alias?: string; // Alias for the deployed contract
}

export interface InteractRequest {
  contractAddress: string; // Address or alias (e.g. "contracts:counter")
  functionName: string;
  args: unknown[];
  action: 'send' | 'simulate';
  from: string; // Account alias or address
}

// ── Response Types ──

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CompileResult {
  artifacts: object[];
  warnings?: string[];
}

export interface NetworkInfo {
  connected: boolean;
  nodeUrl: string;
  chainId?: number;
  protocolVersion?: number;
  blockNumber?: number;
}

export interface AccountInfo {
  address: string;
  alias?: string;
}

export interface DeployResult {
  address: string;
  txHash: string;
}

export interface InteractResult {
  result: string;
  txHash?: string;
}
