import type {
  ApiResponse,
  CompileResult,
  NetworkInfo,
  AccountInfo,
} from './types';

const API_BASE = 'http://localhost:3001';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data: ApiResponse<T> = await res.json();

  if (!data.success) {
    throw new Error(data.error || 'Request failed');
  }

  return data.data as T;
}

// ── Network ──

export function connect(nodeUrl: string): Promise<NetworkInfo> {
  return request('/network/connect', {
    method: 'POST',
    body: JSON.stringify({ nodeUrl }),
  });
}

export function getNetworkInfo(): Promise<NetworkInfo> {
  return request('/network/info');
}

// ── Compile ──

export function compile(
  sources: Record<string, string>,
  contractName: string,
): Promise<CompileResult> {
  return request('/compile', {
    method: 'POST',
    body: JSON.stringify({ sources, contractName }),
  });
}

// ── Accounts ──

export function getAccounts(): Promise<AccountInfo[]> {
  return request('/accounts');
}

export function importTestAccounts(): Promise<AccountInfo[]> {
  return request('/accounts/import-test', { method: 'POST' });
}

// ── Deploy ──

export function deploy(
  artifact: object,
  args: unknown[],
  from: string,
  alias?: string,
): Promise<{ address: string; txHash: string }> {
  return request('/deploy', {
    method: 'POST',
    body: JSON.stringify({ artifact, args, from, alias }),
  });
}

// ── Interact ──

export function interact(
  contractAddress: string,
  functionName: string,
  args: unknown[],
  action: 'send' | 'simulate',
  from: string,
): Promise<{ result: string; txHash?: string }> {
  return request('/interact', {
    method: 'POST',
    body: JSON.stringify({ contractAddress, functionName, args, action, from }),
  });
}
