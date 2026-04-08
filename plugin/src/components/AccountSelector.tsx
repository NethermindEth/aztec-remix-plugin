import type { AccountInfo } from '../types';

interface AccountSelectorProps {
  accounts: AccountInfo[];
  selected: string;
  onChange: (address: string) => void;
  loading?: boolean;
}

export default function AccountSelector({
  accounts,
  selected,
  onChange,
  loading,
}: AccountSelectorProps) {
  if (loading) {
    return (
      <div className="form-group">
        <label>Account</label>
        <select disabled>
          <option>Loading accounts...</option>
        </select>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="form-group">
        <label>Account</label>
        <select disabled>
          <option>No accounts available</option>
        </select>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
          Run `aztec-wallet import-test-accounts` to import test accounts
        </div>
      </div>
    );
  }

  return (
    <div className="form-group">
      <label>Account</label>
      <select value={selected} onChange={(e) => onChange(e.target.value)}>
        {accounts.map((acct) => (
          <option key={acct.address} value={acct.address}>
            {acct.alias || 'Account'} ({acct.address.slice(0, 10)}...{acct.address.slice(-6)})
          </option>
        ))}
      </select>
    </div>
  );
}
