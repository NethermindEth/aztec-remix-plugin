import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NetworkInfo, AccountInfo } from '../types.js';
import { getWalletBinaryPath, SETTINGS_PATH } from '../config.js';

const execFileAsync = promisify(execFile);

export type ProverMode = 'none' | 'wasm' | 'native';

interface PersistedSettings {
  proverMode?: ProverMode;
}

export class AztecService {
  private nodeUrl: string = 'http://localhost:8080';
  private connected: boolean = false;
  private walletBin: string;
  private proverMode: ProverMode = 'none';

  private constructor() {
    this.walletBin = getWalletBinaryPath();
  }

  /** Factory method — awaits settings load before returning. */
  static async create(): Promise<AztecService> {
    const service = new AztecService();
    await service.loadSettings();
    return service;
  }

  // ── Settings ──

  private async loadSettings(): Promise<void> {
    try {
      const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
      const settings = JSON.parse(raw) as PersistedSettings;
      if (settings.proverMode && ['none', 'wasm', 'native'].includes(settings.proverMode)) {
        this.proverMode = settings.proverMode;
      }
    } catch {
      // No settings file yet — use defaults
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
      await fs.writeFile(SETTINGS_PATH, JSON.stringify({ proverMode: this.proverMode }, null, 2));
    } catch {
      // Best-effort
    }
  }

  getProverMode(): ProverMode {
    return this.proverMode;
  }

  setProverMode(mode: ProverMode): void {
    this.proverMode = mode;
    this.saveSettings();
  }

  // ── JSON-RPC helper for node_* methods ──

  private async nodeRpc(method: string, params: unknown[] = []): Promise<unknown> {
    const res = await fetch(this.nodeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: AbortSignal.timeout(30_000),
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
      '--prover', this.proverMode,
    ];

    return execFileAsync(this.walletBin, fullArgs, {
      timeout: 300_000,
      env: { ...process.env },
    });
  }

  // ── Network ──

  async connect(nodeUrl: string): Promise<NetworkInfo> {
    this.nodeUrl = nodeUrl;

    const nodeInfo = await this.nodeRpc('node_getNodeInfo') as Record<string, unknown>;
    this.connected = true;

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
      const { stdout } = await this.wallet(['get-alias', 'accounts']);
      const accounts: AccountInfo[] = [];

      // Output format: "accounts:alias -> 0xaddress"
      for (const line of stdout.split('\n')) {
        const match = line.match(/^\s*(\S+)\s*->\s*(0x[0-9a-fA-F]+)/);
        if (match) {
          // Strip the "accounts:" prefix from the alias so downstream code
          // can add it back consistently via getAccountRef()
          const rawAlias = match[1];
          const alias = rawAlias.startsWith('accounts:')
            ? rawAlias.slice('accounts:'.length)
            : rawAlias;
          accounts.push({
            address: match[2],
            alias,
          });
        }
      }

      return accounts;
    } catch {
      return [];
    }
  }

  async importTestAccounts(): Promise<AccountInfo[]> {
    await this.wallet(['import-test-accounts']);
    return this.getAccounts();
  }

  async createAccount(alias?: string, feePayer?: string): Promise<AccountInfo> {
    this.ensureConnected();

    const cliArgs = ['create-account'];
    if (alias) {
      cliArgs.push('-a', alias);
    }
    if (feePayer) {
      cliArgs.push('-f', feePayer);
    }

    const { stdout } = await this.wallet(cliArgs);

    const addressMatch = stdout.match(/[Aa]ddress:\s*(0x[0-9a-fA-F]+)/);
    if (!addressMatch) {
      throw new Error(`Account created but could not parse address from output:\n${stdout}`);
    }

    return {
      address: addressMatch[1],
      alias: alias || undefined,
    };
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
      action,
      functionName,
      '--from', from,
      '--contract-address', contractAddress,
    ];

    if (args.length > 0) {
      cliArgs.push('--args', ...args.map(String));
    }

    const { stdout } = await this.wallet(cliArgs);

    if (action === 'simulate') {
      const resultMatch = stdout.match(/Simulation result:\s*(.+)/i);
      return { result: resultMatch?.[1]?.trim() || stdout.trim() };
    } else {
      const txHashMatch = stdout.match(/Transaction hash:\s*(0x[0-9a-fA-F]+)/i);
      const statusMatch = stdout.match(/Status:\s*(\S+)/i);
      return {
        result: statusMatch?.[1] || 'mined',
        txHash: txHashMatch?.[1],
      };
    }
  }

  // ── AuthWitness ──

  async createAuthWit(opts: {
    functionName: string;
    caller: string;
    contractAddress: string;
    contractArtifactPath: string;
    from: string;
    args?: unknown[];
    alias?: string;
  }): Promise<{ output: string }> {
    this.ensureConnected();

    const cliArgs = [
      'create-authwit',
      opts.functionName,
      opts.caller,
      '--contract-address', opts.contractAddress,
      '--contract-artifact', opts.contractArtifactPath,
      '--from', opts.from,
    ];

    if (opts.args && opts.args.length > 0) {
      cliArgs.push('--args', ...opts.args.map(String));
    }
    if (opts.alias) {
      cliArgs.push('-a', opts.alias);
    }

    const { stdout } = await this.wallet(cliArgs);
    return { output: stdout.trim() };
  }

  async authorizeAction(opts: {
    functionName: string;
    caller: string;
    contractAddress: string;
    from: string;
    args?: unknown[];
  }): Promise<{ output: string }> {
    this.ensureConnected();

    const cliArgs = [
      'authorize-action',
      opts.functionName,
      opts.caller,
      '--contract-address', opts.contractAddress,
      '--from', opts.from,
    ];

    if (opts.args && opts.args.length > 0) {
      cliArgs.push('--args', ...opts.args.map(String));
    }

    const { stdout } = await this.wallet(cliArgs);
    return { output: stdout.trim() };
  }

  // ── Register Contract ──

  async registerContract(opts: {
    address: string;
    artifactPath: string;
    alias?: string;
    args?: unknown[];
  }): Promise<{ output: string }> {
    this.ensureConnected();

    const cliArgs = ['register-contract', opts.address, opts.artifactPath];

    if (opts.alias) {
      cliArgs.push('-a', opts.alias);
    }
    if (opts.args && opts.args.length > 0) {
      cliArgs.push('--args', ...opts.args.map(String));
    }

    const { stdout } = await this.wallet(cliArgs);
    return { output: stdout.trim() };
  }

  // ── Transaction History ──

  async getRecentTxs(): Promise<{ output: string }> {
    this.ensureConnected();
    const { stdout } = await this.wallet(['get-tx']);
    return { output: stdout.trim() };
  }

  async getTxDetails(txHash: string): Promise<{ output: string }> {
    this.ensureConnected();
    const { stdout } = await this.wallet(['get-tx', txHash]);
    return { output: stdout.trim() };
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
