import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/client'
import type { TwoFASetupResponse, TwoFAVerifySetupResponse, TwoFARegenerateResponse } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import RecoveryCodesDisplay from './RecoveryCodesDisplay'

type SectionState = 'idle' | 'setup' | 'showing_codes' | 'disabling' | 'regenerating'

export default function TwoFactorSection() {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const [state, setState] = useState<SectionState>('idle')
  const [setupData, setSetupData] = useState<TwoFASetupResponse | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [verifyCode, setVerifyCode] = useState('')
  const [password, setPassword] = useState('')

  const statusQuery = useQuery({
    queryKey: ['2fa-status'],
    queryFn: authApi.get2FAStatus,
  })

  const setupMutation = useMutation({
    mutationFn: authApi.setup2FA,
    onSuccess: (data: TwoFASetupResponse) => {
      setSetupData(data)
      setState('setup')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('twoFactor.setupFailed'))),
  })

  const verifySetupMutation = useMutation({
    mutationFn: authApi.verifySetup2FA,
    onSuccess: (data: TwoFAVerifySetupResponse) => {
      setRecoveryCodes(data.recovery_codes)
      setState('showing_codes')
      setVerifyCode('')
      setSetupData(null)
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('twoFactor.invalidCode'))),
  })

  const disableMutation = useMutation({
    mutationFn: authApi.disable2FA,
    onSuccess: () => {
      toast.success(t('twoFactor.disabledToast'))
      setState('idle')
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('twoFactor.disableFailed'))),
  })

  const regenerateMutation = useMutation({
    mutationFn: authApi.regenerateRecoveryCodes,
    onSuccess: (data: TwoFARegenerateResponse) => {
      setRecoveryCodes(data.recovery_codes)
      setState('showing_codes')
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('twoFactor.regenFailed'))),
  })

  const handleSetup = () => {
    setupMutation.mutate()
  }

  const handleVerifySetup = (e: React.FormEvent) => {
    e.preventDefault()
    if (!verifyCode) return
    verifySetupMutation.mutate(verifyCode)
  }

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    disableMutation.mutate(password)
  }

  const handleRegenerate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    regenerateMutation.mutate(password)
  }

  const handleAcknowledge = () => {
    setState('idle')
    setRecoveryCodes([])
  }

  const cancelSetup = () => {
    setState('idle')
    setSetupData(null)
    setVerifyCode('')
  }

  const cancelPasswordAction = () => {
    setState('idle')
    setPassword('')
  }

  if (statusQuery.isLoading) {
    return <p className="text-sm text-text-muted">{t('twoFactor.loading')}</p>
  }

  const status = statusQuery.data

  if (state === 'showing_codes') {
    return (
      <RecoveryCodesDisplay codes={recoveryCodes} onAcknowledge={handleAcknowledge} />
    )
  }

  if (state === 'setup' && setupData) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-text mb-1">
            {t('twoFactor.setupTitle')}
          </h3>
          <p className="text-sm text-text-muted">
            {t('twoFactor.setupBody')}
          </p>
        </div>

        <div className="flex justify-center">
          <div className="bg-surface rounded-sm p-4 inline-block border border-border">
            <img src={setupData.qr_code_svg} alt={t('twoFactor.qrAlt')} className="w-48 h-48" />
          </div>
        </div>

        <div className="bg-surface-muted rounded-sm p-4">
          <p className="text-sm text-text-muted mb-2">
            {t('twoFactor.manualKey')}
          </p>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm text-text bg-surface px-3 py-1 rounded-none border border-border break-all select-all">
              {setupData.secret_key}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(setupData.secret_key)
                  toast.success(t('twoFactor.copiedToast'))
                } catch {
                  toast.error(t('twoFactor.copyFailedToast'))
                }
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-text-muted hover:bg-surface-hover transition-colors shrink-0"
            >
              {t('twoFactor.copy')}
            </button>
          </div>
        </div>

        <form onSubmit={handleVerifySetup} className="space-y-4">
          <div>
            <label htmlFor="verify-code" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
              {t('twoFactor.codeLabel')}
            </label>
            <input
              id="verify-code"
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full max-w-xs bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors tracking-widest text-center"
              placeholder="000000"
              maxLength={6}
              required
              autoComplete="one-time-code"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={verifySetupMutation.isPending || verifyCode.length !== 6}
              className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifySetupMutation.isPending ? t('twoFactor.verifying') : t('twoFactor.verify')}
            </button>
            <button
              type="button"
              onClick={cancelSetup}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
            >
              {t('twoFactor.cancel')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (state === 'disabling') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-text mb-1">
            {t('twoFactor.disableTitle')}
          </h3>
          <p className="text-sm text-text-muted">
            {t('twoFactor.disableBody')}
          </p>
        </div>
        <form onSubmit={handleDisable} className="space-y-4">
          <div>
            <label htmlFor="disable-password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
              {t('twoFactor.passwordLabel')}
            </label>
            <input
              id="disable-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full max-w-xs bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder={t('twoFactor.passwordPlaceholder')}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={disableMutation.isPending || !password}
              className="bg-surface border border-negative/30 text-negative px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-negative-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disableMutation.isPending ? t('twoFactor.disabling') : t('twoFactor.disable')}
            </button>
            <button
              type="button"
              onClick={cancelPasswordAction}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
            >
              {t('twoFactor.cancel')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (state === 'regenerating') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-text mb-1">
            {t('twoFactor.regenTitle')}
          </h3>
          <p className="text-sm text-text-muted">
            {t('twoFactor.regenBody')}
          </p>
        </div>
        <form onSubmit={handleRegenerate} className="space-y-4">
          <div>
            <label htmlFor="regenerate-password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
              {t('twoFactor.passwordLabel')}
            </label>
            <input
              id="regenerate-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full max-w-xs bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder={t('twoFactor.passwordPlaceholder')}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={regenerateMutation.isPending || !password}
              className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {regenerateMutation.isPending ? t('twoFactor.regenerating') : t('twoFactor.regen')}
            </button>
            <button
              type="button"
              onClick={cancelPasswordAction}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
            >
              {t('twoFactor.cancel')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (status?.enabled) {
    return (
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-positive-bg text-positive border border-positive/20">
              {t('twoFactor.enabledBadge')}
            </span>
            <h3 className="text-sm font-medium text-text">
              {t('twoFactor.enabledTitle')}
            </h3>
          </div>
          <p className="text-sm text-text-muted">
            {t('twoFactor.enabledBody')}
          </p>
        </div>

        <div className="bg-surface-muted rounded-sm p-4 border border-border">
          <p className="text-sm text-text-muted">
            {t('twoFactor.remaining')}{' '}
            <span className="font-medium text-text">{status.remaining_recovery_codes}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setPassword('')
              setState('regenerating')
            }}
            className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
          >
            {t('twoFactor.regenerate')}
          </button>
          <button
            type="button"
            onClick={() => {
              setPassword('')
              setState('disabling')
            }}
            className="bg-surface border border-negative/30 text-negative px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-negative-bg transition-colors"
          >
            {t('twoFactor.disable')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-text mb-1">
          {t('twoFactor.enabledTitle')}
        </h3>
        <p className="text-sm text-text-muted">
          {t('twoFactor.introBody')}
        </p>
      </div>
      <button
        type="button"
        onClick={handleSetup}
        disabled={setupMutation.isPending}
        className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {setupMutation.isPending ? t('twoFactor.loading') : t('twoFactor.enable')}
      </button>
    </div>
  )
}
