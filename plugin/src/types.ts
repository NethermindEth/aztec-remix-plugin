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

export interface CompileError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  type: 'error' | 'warning';
}

export interface CompileResult {
  artifacts: ContractArtifact[];
  warnings?: string[];
  errors?: CompileError[];
}

export interface ContractArtifact {
  name: string;
  functions: AbiFunction[];
  [key: string]: unknown;
}

export interface AbiFunction {
  name: string;
  functionType: 'secret' | 'open' | 'unconstrained';
  isInternal: boolean;
  isInitializer: boolean;
  parameters: AbiParameter[];
  returnTypes: AbiType[];
  [key: string]: unknown;
}

export interface AbiParameter {
  name: string;
  type: AbiType;
  visibility: 'public' | 'private';
}

export interface AbiType {
  kind: string;
  width?: number;
  sign?: string;
  length?: number;
  type?: AbiType;
  fields?: { name: string; type: AbiType }[];
  path?: string;
  [key: string]: unknown;
}

export interface DeployedContract {
  name: string;
  address: string;
  artifact: ContractArtifact;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
