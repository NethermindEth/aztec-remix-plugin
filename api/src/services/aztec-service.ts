import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { NetworkInfo, AccountInfo } from '../types.js';

const execFileAsync = promisify(execFile);

/**
 * Resolve the aztec-wallet binary path.
 * Checks AZTEC_WALLET_PATH env, then falls back to the standard install location.
 */
function getWalletBinaryPath(): string {
  if (process.env.AZTEC_WALLET_PATH) return process.env.AZTEC_WALLET_PATH;
  const home = os.homedir();
  return path.join(home, '.aztec', 'current', 'node_modules', '.bin', 'aztec-wallet');
}

/**
 * AztecService manages the connection to an Aztec node and
 * handles deployment + interaction by shelling out to `aztec-wallet` CLI.
 *
 * The Aztec Node only exposes `node_*` JSON-RPC methods (block info, tx receipts).
 * All PXE/wallet operations (accounts, deploy, interact) require `aztec-wallet`
 * which embeds PXE as a library internally.
 */
export class AztecService {
  private nodeUrl: string = 'http://localhost:8080';
  private connected: boolean = false;
  private walletBin: string;
  private walletDataDir: string;

  constructor() {
    this.walletBin = getWalletBinaryPath();
    // Use a persistent data directory so accounts/contracts persist across API restarts
    this.walletDataDir = path.join(os.homedir(), '.aztec', 'wallet', 'pxe', 'pxe_data');
  }

  // ── JSON-RPC helper for node_* methods ──

  private async nodeRpc(method: string, params: unknown[] = []): Promise<unknown> {
    const res = await fetch(this.nodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    });

    const data = await res.json() as { result?: unknown; error?: { message: string } };
    if (data.error) {
      throw new Error(data.error.message || `RPC ${method} failed`);
    }
    return data.result;
  }

  // ── aztec-wallet CLI helper ──

  private async wallet(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const fullArgs = [
      ...args,
      '--node-url', this.nodeUrl,
      '--prover', 'none',
    ];

    return execFileAsync(this.walletBin, fullArgs, {
      timeout: 300_000, // 5 min for deploy/send operations
      env: { ...process.env },
    });
  }

  // ── Network ──

  async connect(nodeUrl: string): Promise<NetworkInfo> {
    this.nodeUrl = nodeUrl;

    // Test connection via JSON-RPC node_getNodeInfo
    const nodeInfo = await this.nodeRpc('node_getNodeInfo') as Record<string, unknown>;
    this.connected = true;

    // Also get block number
    let blockNumber: number | undefined;
    try {
      blockNumber = (await this.nodeRpc('node_getBlockNumber')) as number;
    } catch {
      // Non-critical
    }

    return {
      connected: true,
      nodeUrl: this.nodeUrl,
      chainId: nodeInfo.l1ChainId as number | undefined,
      protocolVersion: nodeInfo.protocolVersion as number | undefined,
      blockNumber,
    };
  }

  async getNetworkInfo(): Promise<NetworkInfo> {
    if (!this.connected) {
      return { connected: false, nodeUrl: this.nodeUrl };
    }

    try {
      const blockNumber = (await this.nodeRpc('node_getBlockNumber')) as number;
      return {
        connected: true,
        nodeUrl: this.nodeUrl,
        blockNumber,
      };
    } catch {
      this.connected = false;
      return { connected: false, nodeUrl: this.nodeUrl };
    }
  }

  // ── Accounts ──

  async getAccounts(): Promise<AccountInfo[]> {
    try {
      // Use `aztec-wallet get-alias accounts` to list known account aliases
      const { stdout } = await this.wallet(['get-alias', 'accounts']);
      const accounts: AccountInfo[] = [];

      // Output format: "alias -> address"
      for (const line of stdout.split('\n')) {
        const match = line.match(/^\s*(\S+)\s*->\s*(0x[0-9a-fA-F]+)/);
        if (match) {
          accounts.push({
            address: match[2],
            alias: match[1],
          });
        }
      }

      return accounts;
    } catch {
      return [];
    }
  }

  async importTestAccounts(): Promise<AccountInfo[]> {
    try {
      await this.wallet(['import-test-accounts']);
      return this.getAccounts();
    } catch (err) {
      throw new Error(
        `Failed to import test accounts: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // ── Deploy ──

  async deploy(
    artifactPath: string,
    args: unknown[],
    from: string,
    alias?: string,
  ): Promise<{ address: string; txHash: string }> {
    this.ensureConnected();

    const cliArgs = ['deploy', artifactPath, '--from', from];

    if (args.length > 0) {
      cliArgs.push('--args', ...args.map(String));
    }

    if (alias) {
      cliArgs.push('-a', alias);
    }

    const { stdout } = await this.wallet(cliArgs);

    // Parse output: "Contract deployed at 0x..."
    const addressMatch = stdout.match(/deployed at\s+(0x[0-9a-fA-F]+)/i);
    const txHashMatch = stdout.match(/(?:Transaction|Deployment tx) hash:\s+(0x[0-9a-fA-F]+)/i);

    if (!addressMatch) {
      throw new Error(`Deploy succeeded but could not parse address from output:\n${stdout}`);
    }

    return {
      address: addressMatch[1],
      txHash: txHashMatch?.[1] || 'unknown',
    };
  }

  // ── Interact ──

  async interact(
    contractAddress: string,
    functionName: string,
    args: unknown[],
    action: 'send' | 'simulate',
    from: string,
  ): Promise<{ result: string; txHash?: string }> {
    this.ensureConnected();

    const cliArgs = [
      action, // 'send' or 'simulate'
      functionName,
      '--from', from,
      '--contract-address', contractAddress,
    ];

    if (args.length > 0) {
      cliArgs.push('--args', ...args.map(String));
    }

    const { stdout } = await this.wallet(cliArgs);

    if (action === 'simulate') {
      // Parse: "Simulation result: 42n" or similar
      const resultMatch = stdout.match(/Simulation result:\s*(.+)/i);
      return { result: resultMatch?.[1]?.trim() || stdout.trim() };
    } else {
      // Parse: "Transaction has been mined" + possible tx hash
      const txHashMatch = stdout.match(/Transaction hash:\s*(0x[0-9a-fA-F]+)/i);
      const statusMatch = stdout.match(/Status:\s*(\S+)/i);
      return {
        result: statusMatch?.[1] || 'mined',
        txHash: txHashMatch?.[1],
      };
    }
  }

  // ── Helpers ──

  isConnected(): boolean {
    return this.connected;
  }

  getNodeUrl(): string {
    return this.nodeUrl;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to an Aztec node. Call /connect first.');
    }
  }
}
