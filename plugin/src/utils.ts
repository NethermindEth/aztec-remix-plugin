import type { AbiParameter, AccountInfo } from './types';

// ── Input Limits ──

export const LIMITS = {
  ALIAS_MAX_LENGTH: 32,
  CONTRACT_NAME_MAX_LENGTH: 64,
  ARG_MAX_LENGTH: 256,
  SOURCE_FILE_MAX_SIZE: 5 * 1024 * 1024, // 5MB
} as const;

// ── Integer Range Validation ──

const INTEGER_RANGES: Record<string, { min: bigint; max: bigint }> = {
  u8: { min: 0n, max: 255n },
  u16: { min: 0n, max: 65535n },
  u32: { min: 0n, max: 4294967295n },
  u64: { min: 0n, max: 18446744073709551615n },
  u128: { min: 0n, max: 340282366920938463463374607431768211455n },
  i8: { min: -128n, max: 127n },
  i16: { min: -32768n, max: 32767n },
  i32: { min: -2147483648n, max: 2147483647n },
  i64: { min: -9223372036854775808n, max: 9223372036854775807n },
};

/**
 * Validate a string value against an ABI parameter type.
 * Returns an error message if invalid, or null if valid.
 */
export function validateArg(param: AbiParameter, value: string): string | null {
  if (value.length > LIMITS.ARG_MAX_LENGTH) {
    return `${param.name}: value too long (max ${LIMITS.ARG_MAX_LENGTH} chars)`;
  }

  if (param.type.kind === 'integer' && param.type.width) {
    const sign = param.type.sign === 'signed' ? 'i' : 'u';
    const typeName = `${sign}${param.type.width}`;
    const range = INTEGER_RANGES[typeName];

    if (range && value.trim()) {
      try {
        const n = BigInt(value.trim());
        if (n < range.min || n > range.max) {
          return `${param.name}: ${value} is out of range for ${typeName} (${range.min} to ${range.max})`;
        }
      } catch {
        return `${param.name}: "${value}" is not a valid integer`;
      }
    }
  }

  if (param.type.kind === 'boolean') {
    if (value && value !== 'true' && value !== 'false') {
      return `${param.name}: must be "true" or "false"`;
    }
  }

  return null;
}

/**
 * Build args array from form values, with type coercion.
 */
export function buildArgs(params: AbiParameter[], values: Record<string, string>): unknown[] {
  return params.map((p) => {
    const val = values[p.name] || '';
    if (p.type.kind === 'integer' || p.type.kind === 'field') {
      return val || '0';
    }
    if (p.type.kind === 'boolean') {
      return val === 'true';
    }
    return val;
  });
}

/**
 * Get the account reference string for aztec-wallet CLI.
 */
export function getAccountRef(address: string, accounts: AccountInfo[]): string {
  const acct = accounts.find((a) => a.address === address);
  if (acct?.alias) return `accounts:${acct.alias}`;
  return address;
}

/**
 * Validate an alias string. Returns error message or null.
 */
export function validateAlias(alias: string): string | null {
  if (alias.length > LIMITS.ALIAS_MAX_LENGTH) {
    return `Alias too long (max ${LIMITS.ALIAS_MAX_LENGTH} chars)`;
  }
  return null;
}
