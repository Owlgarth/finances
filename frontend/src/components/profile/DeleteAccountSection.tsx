import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi, clearAuthToken } from '../../api/client';
import { getApiErrorMessage } from '../../utils/errors';

export default function DeleteAccountSection() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const checkQuery = useQuery({
    queryKey: ['account-delete-check'],
    queryFn: authApi.checkDeletion,
  });
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsDeleting(true);
    try {
      await authApi.deleteAccount(password);
      queryClient.clear();
      toast.success(t('deleteAccount.success'));
      clearAuthToken();
      navigate('/login');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('deleteAccount.failed')));
    } finally {
      setIsDeleting(false);
    }
  };

  if (checkQuery.isLoading) {
    return <p className="text-sm text-text-muted">{t('deleteAccount.loading')}</p>;
  }

  if (checkQuery.isError || !checkQuery.data) {
    return <p className="text-sm text-text-muted">{t('deleteAccount.loadError')}</p>;
  }

  const check = checkQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-sans font-semibold text-negative text-sm mb-1">{t('deleteAccount.title')}</h3>
        <p className="text-sm text-text-muted">
          {t('deleteAccount.body')}
        </p>
      </div>

      {check && !check.can_delete && (
        <div className="bg-warning-bg rounded-sm p-4">
          <p className="text-sm font-medium text-warning mb-2">
            {t('deleteAccount.blockedTitle')}
          </p>
          <p className="text-sm text-warning mb-2">
            {t('deleteAccount.blockedBody')}
          </p>
          {check.blocking_workspaces && (
            <ul className="text-sm text-warning list-disc list-inside">
              {check.blocking_workspaces.map(ws => (
                <li key={ws.id}>{ws.name} ({t('deleteAccount.memberCount', { count: ws.member_count })})</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {check && check.can_delete && (
        <div className="bg-negative-bg rounded-sm p-4 space-y-2">
          <p className="text-sm font-medium text-negative">{t('deleteAccount.willDelete')}</p>
          {check.solo_workspaces.length > 0 && (
            <div>
              <p className="text-sm text-negative">{t('deleteAccount.workspacesLabel')}</p>
              <ul className="text-sm text-negative list-disc list-inside">
                {check.solo_workspaces.map(name => <li key={name}>{name}</li>)}
              </ul>
            </div>
          )}
          {check.shared_workspace_memberships > 0 && (
            <p className="text-sm text-negative">
              {t('deleteAccount.sharedRemoval', { count: check.shared_workspace_memberships })}
            </p>
          )}
          <p className="text-sm text-negative">
            {t('deleteAccount.totalAffected')}{' '}
            {t('deleteAccount.txnCount', { count: check.total_transactions })},{' '}
            {t('deleteAccount.plannedCount', { count: check.total_planned_transactions })}.
          </p>
        </div>
      )}

      <form onSubmit={handleDelete} className="space-y-4">
        <div>
          <label htmlFor="delete-password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
            {t('deleteAccount.passwordLabel')}
          </label>
          <input
            id="delete-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all"
            placeholder={t('deleteAccount.passwordPlaceholder')}
          />
        </div>

        <button
          type="submit"
          disabled={isDeleting || !check?.can_delete || !password}
          className="bg-surface border border-negative/30 text-negative px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-negative-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDeleting ? t('deleteAccount.deleting') : t('deleteAccount.submit')}
        </button>
      </form>
    </div>
  );
}
