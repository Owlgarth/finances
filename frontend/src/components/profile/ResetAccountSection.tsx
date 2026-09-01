import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api/client';
import CurrencySetField from '../currencies/CurrencySetField';
import { PRE_AUTH_CURRENCIES } from '../../utils/currencies';
import { getApiErrorMessage } from '../../utils/errors';

const inputClassName =
  'w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all';

export default function ResetAccountSection() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // The name default is a translatable UI seed: it becomes user-editable
  // persisted data the moment the form is submitted.
  const [workspaceName, setWorkspaceName] = useState(() => t('resetAccount.defaultWorkspaceName'));
  const [currencyCodes, setCurrencyCodes] = useState<string[]>(['PLN']);
  const [password, setPassword] = useState('');
  const [confirmShared, setConfirmShared] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    if (currencyCodes.length === 0) return toast.error(t('resetAccount.currencyRequired'));

    setIsResetting(true);
    try {
      const result = await authApi.resetAccount({
        password,
        workspace_name: workspaceName.trim() || t('resetAccount.defaultWorkspaceName'),
        currency_codes: currencyCodes,
        confirm_shared: confirmShared,
      });
      queryClient.clear();
      toast.success(t('resetAccount.success', { name: result.workspace_name }));
      navigate('/');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('resetAccount.failed')));
    } finally {
      setIsResetting(false);
      setPassword('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-sans font-semibold text-warning text-sm mb-1">{t('resetAccount.title')}</h3>
        <p className="text-sm text-text-muted">
          {t('resetAccount.body')}
        </p>
      </div>

      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label htmlFor="reset-workspace-name" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
            {t('resetAccount.workspaceNameLabel')}
          </label>
          <input
            id="reset-workspace-name"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            maxLength={100}
            className={inputClassName}
          />
        </div>

        <CurrencySetField
          value={currencyCodes}
          onChange={setCurrencyCodes}
          currencies={PRE_AUTH_CURRENCIES}
          primaryLabel={t('resetAccount.mainAccount')}
          placeholder={t('resetAccount.selectCurrencies')}
        />

        <label className="flex items-start gap-2 text-sm text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={confirmShared}
            onChange={(e) => setConfirmShared(e.target.checked)}
            className="mt-0.5"
          />
          <span>{t('resetAccount.confirmShared')}</span>
        </label>

        <div>
          <label htmlFor="reset-password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
            {t('resetAccount.passwordLabel')}
          </label>
          <input
            id="reset-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClassName}
            placeholder={t('resetAccount.passwordPlaceholder')}
          />
        </div>

        <button
          type="submit"
          disabled={isResetting || !password}
          className="bg-surface border border-warning/40 text-warning px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-warning-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isResetting ? t('resetAccount.submitting') : t('resetAccount.submit')}
        </button>
      </form>
    </div>
  );
}
