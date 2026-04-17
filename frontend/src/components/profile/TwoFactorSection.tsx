import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authApi } from '../../api/client'
import type { TwoFASetupResponse, TwoFAVerifySetupResponse, TwoFARegenerateResponse } from '../../types'
import RecoveryCodesDisplay from './RecoveryCodesDisplay'

type SectionState = 'idle' | 'setup' | 'showing_codes' | 'disabling' | 'regenerating'

export default function TwoFactorSection() {
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
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || 'Failed to start 2FA setup')
    },
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
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || 'Invalid verification code')
    },
  })

  const disableMutation = useMutation({
    mutationFn: authApi.disable2FA,
    onSuccess: () => {
      toast.success('Two-factor authentication has been disabled')
      setState('idle')
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || 'Failed to disable 2FA')
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: authApi.regenerateRecoveryCodes,
    onSuccess: (data: TwoFARegenerateResponse) => {
      setRecoveryCodes(data.recovery_codes)
      setState('showing_codes')
      setPassword('')
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || 'Failed to regenerate recovery codes')
    },
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
    return <p className="text-sm text-text-muted">Loading...</p>
  }

  const status = statusQuery.data

  if (state === 'showing_codes') {
    return (
      <RecoveryCodesDisplay
        codes={recoveryCodes}
        showAcknowledge={true}
        onAcknowledge={handleAcknowledge}
      />
    )
  }

  if (state === 'setup' && setupData) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-medium text-text mb-1">
            Set Up Authenticator App
          </h3>
          <p className="text-sm text-text-muted">
            Scan this QR code with your authenticator app.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="bg-surface rounded-sm p-4 inline-block border border-border">
            <img src={setupData.qr_code_svg} alt="2FA QR Code" className="w-48 h-48" />
          </div>
        </div>

        <div className="bg-surface-muted rounded-sm p-4">
          <p className="text-sm text-text-muted mb-2">
            Manual entry key:
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
                  toast.success('Secret key copied')
                } catch {
                  toast.error('Failed to copy')
                }
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-sm border border-border text-text-muted hover:bg-surface-hover transition-colors shrink-0"
            >
              Copy
            </button>
          </div>
        </div>

        <form onSubmit={handleVerifySetup} className="space-y-4">
          <div>
            <label htmlFor="verify-code" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
              Verification Code
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
              {verifySetupMutation.isPending ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={cancelSetup}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
            >
              Cancel
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
            Disable Two-Factor Authentication
          </h3>
          <p className="text-sm text-text-muted">
            Enter your password to disable 2FA. This will make your account less secure.
          </p>
        </div>
        <form onSubmit={handleDisable} className="space-y-4">
          <div>
            <label htmlFor="disable-password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
              Confirm your password
            </label>
            <input
              id="disable-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full max-w-xs bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder="Enter your password"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={disableMutation.isPending || !password}
              className="bg-surface border border-negative/30 text-negative px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-negative-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disableMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
            </button>
            <button
              type="button"
              onClick={cancelPasswordAction}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
            >
              Cancel
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
            Regenerate Recovery Codes
          </h3>
          <p className="text-sm text-text-muted">
            This will invalidate your current recovery codes and generate new ones.
          </p>
        </div>
        <form onSubmit={handleRegenerate} className="space-y-4">
          <div>
            <label htmlFor="regenerate-password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
              Confirm your password
            </label>
            <input
              id="regenerate-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full max-w-xs bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder="Enter your password"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={regenerateMutation.isPending || !password}
              className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {regenerateMutation.isPending ? 'Regenerating...' : 'Regenerate Codes'}
            </button>
            <button
              type="button"
              onClick={cancelPasswordAction}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
            >
              Cancel
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
              Enabled
            </span>
            <h3 className="text-sm font-medium text-text">
              Two-Factor Authentication
            </h3>
          </div>
          <p className="text-sm text-text-muted">
            Your account is protected with two-factor authentication.
          </p>
        </div>

        <div className="bg-surface-muted rounded-sm p-4 border border-border">
          <p className="text-sm text-text-muted">
            Recovery codes remaining: <span className="font-medium text-text">{status.remaining_recovery_codes}</span>
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
              Regenerate Recovery Codes
            </button>
          <button
            type="button"
            onClick={() => {
              setPassword('')
              setState('disabling')
            }}
            className="bg-surface border border-negative/30 text-negative px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-negative-bg transition-colors"
          >
            Disable 2FA
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-text mb-1">
          Two-Factor Authentication
        </h3>
        <p className="text-sm text-text-muted">
          Add an extra layer of security by requiring a code from your authenticator app when you sign in.
        </p>
      </div>
      <button
        type="button"
        onClick={handleSetup}
        disabled={setupMutation.isPending}
        className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {setupMutation.isPending ? 'Loading...' : 'Enable 2FA'}
      </button>
    </div>
  )
}
