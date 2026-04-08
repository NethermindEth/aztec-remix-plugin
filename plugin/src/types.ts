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
  custom_attributes: string[];
  abi: {
    parameters: AbiParameter[];
    return_type?: AbiType | null;
    error_types?: Record<string, unknown>;
  };
  // Legacy fields (may not exist in current Aztec artifacts)
  functionType?: string;
  isInternal?: boolean;
  isInitializer?: boolean;
  parameters?: AbiParameter[];
  returnTypes?: AbiType[];
  [key: string]: unknown;
}

export interface AbiParameter {
  name: string;
  type: AbiType;
  visibility?: 'public' | 'private';
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

// ── Helpers for parsing Aztec artifact functions ──

export function isInitializer(fn: AbiFunction): boolean {
  return fn.custom_attributes?.includes('abi_initializer') || fn.isInitializer === true;
}

export function isInternal(fn: AbiFunction): boolean {
  return fn.isInternal === true;
}

export function getFunctionType(fn: AbiFunction): 'private' | 'public' | 'utility' {
  const attrs = fn.custom_attributes || [];
  if (attrs.includes('abi_utility')) return 'utility';
  if (attrs.includes('abi_private')) return 'private';
  if (attrs.includes('abi_public')) return 'public';
  // Fallback for legacy format
  if (fn.functionType === 'unconstrained') return 'utility';
  if (fn.functionType === 'secret') return 'private';
  return 'public';
}

export function getFunctionParams(fn: AbiFunction): AbiParameter[] {
  // Current Aztec format: fn.abi.parameters
  if (fn.abi?.parameters) return fn.abi.parameters;
  // Legacy format: fn.parameters
  if (fn.parameters) return fn.parameters;
  return [];
}

export const HIDDEN_FUNCTIONS = new Set([
  'public_dispatch', 'process_message', 'sync_state', 'sync_notes', 'process_log',
]);
