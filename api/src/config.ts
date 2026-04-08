import path from 'node:path';
import os from 'node:os';

export const AZTEC_HOME = path.join(os.homedir(), '.aztec');
export const ARTIFACT_DIR = path.join(AZTEC_HOME, 'plugin-artifacts');
export const SETTINGS_PATH = path.join(AZTEC_HOME, 'plugin-settings.json');

export function getAztecBinaryPath(): string {
  if (process.env.AZTEC_PATH) return process.env.AZTEC_PATH;
  return path.join(AZTEC_HOME, 'current', 'node_modules', '.bin', 'aztec');
}

export function getWalletBinaryPath(): string {
  if (process.env.AZTEC_WALLET_PATH) return process.env.AZTEC_WALLET_PATH;
  return path.join(AZTEC_HOME, 'current', 'node_modules', '.bin', 'aztec-wallet');
}

export const WALLET_PXE_DATA_DIR = path.join(AZTEC_HOME, 'wallet', 'pxe', 'pxe_data');

export const AZTEC_NR_TAG = 'v4.0.0-devnet.2-patch.0';

export const DEFAULT_NARGO_TOML = (name: string) => {
  // Sanitize contract name: alphanumeric + underscores only
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return `[package]
name = "${safeName}"
type = "contract"

[dependencies]
aztec = { git = "https://github.com/AztecProtocol/aztec-nr", tag = "${AZTEC_NR_TAG}", directory = "aztec" }
`;
};
