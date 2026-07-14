import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authApi } from '../../api/client';

const CURRENCY_OPTIONS = ['PLN', 'EUR', 'USD', 'GBP', 'UAH', 'CHF', 'CZK', 'SEK', 'NOK', 'DKK', 'CAD', 'AUD', 'JPY'];

const inputClassName =
  'w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all';

export default function ResetAccountSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workspaceName, setWorkspaceName] = useState('My Workspace');
  const [currencyCode, setCurrencyCode] = useState('PLN');
  const [password, setPassword] = useState('');
  const [confirmShared, setConfirmShared] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsResetting(true);
    try {
      const result = await authApi.resetAccount({
        password,
        workspace_name: workspaceName.trim() || 'My Workspace',
        currency_code: currencyCode,
        confirm_shared: confirmShared,
      });
      queryClient.clear();
      toast.success(`Account reset — "${result.workspace_name}" is ready.`);
      navigate('/');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      toast.error(err.response?.data?.detail || 'Failed to reset account');
    } finally {
      setIsResetting(false);
      setPassword('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-sans font-semibold text-warning text-sm mb-1">Reset Account Data</h3>
        <p className="text-sm text-text-muted">
          Delete all workspaces you own and every record in them, then start over with a fresh
          empty workspace — as if you had just registered. Your login, preferences, and other
          member users are kept. Memberships in workspaces owned by others are untouched.
          This action is irreversible.
        </p>
      </div>

      <form onSubmit={handleReset} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="reset-workspace-name" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
              New workspace name
            </label>
            <input
              id="reset-workspace-name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              maxLength={100}
              className={inputClassName}
            />
          </div>
          <div>
            <label htmlFor="reset-currency" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
              Currency
            </label>
            <select
              id="reset-currency"
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              className={inputClassName}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={confirmShared}
            onChange={(e) => setConfirmShared(e.target.checked)}
            className="mt-0.5"
          />
          <span>Also delete workspaces I own that other members are using</span>
        </label>

        <div>
          <label htmlFor="reset-password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
            Confirm your password
          </label>
          <input
            id="reset-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClassName}
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={isResetting || !password}
          className="bg-surface border border-warning/40 text-warning px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-warning-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isResetting ? 'Resetting…' : 'Reset Account Data'}
        </button>
      </form>
    </div>
  );
}
