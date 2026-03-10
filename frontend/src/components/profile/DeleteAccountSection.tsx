import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authApi, clearAuthToken } from '../../api/client';
import type { AccountDeleteCheck } from '../../types';

export default function DeleteAccountSection() {
  const navigate = useNavigate();
  const [check, setCheck] = useState<AccountDeleteCheck | null>(null);
  const [isLoadingCheck, setIsLoadingCheck] = useState(true);
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    authApi.checkDeletion()
      .then(setCheck)
      .catch(() => toast.error('Failed to load account deletion info'))
      .finally(() => setIsLoadingCheck(false));
  }, []);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsDeleting(true);
    try {
      await authApi.deleteAccount(password);
      toast.success('Account deleted successfully.');
      clearAuthToken();
      navigate('/login');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const message = err.response?.data?.detail || 'Failed to delete account';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoadingCheck) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-red-600 mb-1">Delete Account</h3>
        <p className="text-sm text-gray-600">
          Permanently delete your account and all associated data. This action is irreversible.
        </p>
      </div>

      {check && !check.can_delete && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-sm font-medium text-yellow-800 mb-2">
            Account deletion is blocked
          </p>
          <p className="text-sm text-yellow-700 mb-2">
            You own workspaces with other members. Transfer ownership or remove all members first.
          </p>
          {check.blocking_workspaces && (
            <ul className="text-sm text-yellow-700 list-disc list-inside">
              {check.blocking_workspaces.map(ws => (
                <li key={ws.id}>{ws.name} ({ws.member_count} members)</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {check && check.can_delete && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 space-y-2">
          <p className="text-sm font-medium text-red-800">The following will be permanently deleted:</p>
          {check.solo_workspaces.length > 0 && (
            <div>
              <p className="text-sm text-red-700">Workspaces and all their data:</p>
              <ul className="text-sm text-red-700 list-disc list-inside">
                {check.solo_workspaces.map(name => <li key={name}>{name}</li>)}
              </ul>
            </div>
          )}
          {check.shared_workspace_memberships > 0 && (
            <p className="text-sm text-red-700">
              You will be removed from {check.shared_workspace_memberships} shared workspace(s).
            </p>
          )}
          <p className="text-sm text-red-700">
            Total records affected: {check.total_transactions} transactions,{' '}
            {check.total_planned_transactions} planned transactions,{' '}
            {check.total_currency_exchanges} currency exchanges.
          </p>
        </div>
      )}

      <form onSubmit={handleDelete} className="space-y-4">
        <div>
          <label htmlFor="delete-password" className="block text-sm font-medium text-gray-700">
            Confirm your password
          </label>
          <input
            id="delete-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={isDeleting || !check?.can_delete || !password}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {isDeleting ? 'Deleting...' : 'Delete My Account'}
        </button>
      </form>
    </div>
  );
}
