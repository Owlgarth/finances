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
    return <p className="text-sm text-on-surface-variant">Loading...</p>
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
          <h3 className="font-headline font-bold text-on-surface text-lg mb-1">
            Set Up Authenticator App
          </h3>
          <p className="text-sm text-on-surface-variant">
            Scan this QR code with your authenticator app.
          </p>
        </div>

        <div className="flex justify-center">
          <div className="bg-white rounded-lg p-4 inline-block">
            <img src={setupData.qr_code_svg} alt="2FA QR Code" className="w-48 h-48" />
          </div>
        </div>

        <div className="bg-surface-container-highest rounded-lg p-4">
          <p className="text-sm text-on-surface-variant mb-2">
            Manual entry key:
          </p>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm text-on-surface bg-surface-container-lowest px-3 py-1 rounded break-all select-all">
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
              className="px-3 py-1 text-xs font-medium rounded-md border border-outline-variant text-on-surface-variant hover:bg-surface-container-low transition-all shrink-0"
            >
              Copy
            </button>
          </div>
        </div>

        <form onSubmit={handleVerifySetup} className="space-y-4">
          <div>
            <label htmlFor="verify-code" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">
              Verification Code
            </label>
            <input
              id="verify-code"
              type="text"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full max-w-xs bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all tracking-widest text-center"
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
              className="px-6 py-2.5 text-on-primary rounded-lg hover:opacity-90 text-sm font-medium bg-gradient-to-br from-primary to-primary-dim active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifySetupMutation.isPending ? 'Verifying...' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={cancelSetup}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all"
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
          <h3 className="font-headline font-bold text-on-surface text-lg mb-1">
            Disable Two-Factor Authentication
          </h3>
          <p className="text-sm text-on-surface-variant">
            Enter your password to disable 2FA. This will make your account less secure.
          </p>
        </div>
        <form onSubmit={handleDisable} className="space-y-4">
          <div>
            <label htmlFor="disable-password" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">
              Confirm your password
            </label>
            <input
              id="disable-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full max-w-xs bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              placeholder="Enter your password"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={disableMutation.isPending || !password}
              className="px-4 py-2 bg-negative text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
            >
              {disableMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
            </button>
            <button
              type="button"
              onClick={cancelPasswordAction}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all"
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
          <h3 className="font-headline font-bold text-on-surface text-lg mb-1">
            Regenerate Recovery Codes
          </h3>
          <p className="text-sm text-on-surface-variant">
            This will invalidate your current recovery codes and generate new ones.
          </p>
        </div>
        <form onSubmit={handleRegenerate} className="space-y-4">
          <div>
            <label htmlFor="regenerate-password" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">
              Confirm your password
            </label>
            <input
              id="regenerate-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full max-w-xs bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              placeholder="Enter your password"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={regenerateMutation.isPending || !password}
              className="px-6 py-2.5 text-on-primary rounded-lg hover:opacity-90 text-sm font-medium bg-gradient-to-br from-primary to-primary-dim active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {regenerateMutation.isPending ? 'Regenerating...' : 'Regenerate Codes'}
            </button>
            <button
              type="button"
              onClick={cancelPasswordAction}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all"
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
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Enabled
            </span>
            <h3 className="font-headline font-bold text-on-surface text-lg">
              Two-Factor Authentication
            </h3>
          </div>
          <p className="text-sm text-on-surface-variant">
            Your account is protected with two-factor authentication.
          </p>
        </div>

        <div className="bg-surface-container-highest rounded-lg p-4">
          <p className="text-sm text-on-surface-variant">
            Recovery codes remaining: <span className="font-medium text-on-surface">{status.remaining_recovery_codes}</span>
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setPassword('')
              setState('regenerating')
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-all"
          >
            Regenerate Recovery Codes
          </button>
          <button
            type="button"
            onClick={() => {
              setPassword('')
              setState('disabling')
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-negative/30 text-negative hover:bg-negative/5 transition-all"
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
        <h3 className="font-headline font-bold text-on-surface text-lg mb-1">
          Two-Factor Authentication
        </h3>
        <p className="text-sm text-on-surface-variant">
          Add an extra layer of security by requiring a code from your authenticator app when you sign in.
        </p>
      </div>
      <button
        type="button"
        onClick={handleSetup}
        disabled={setupMutation.isPending}
        className="px-6 py-2.5 text-on-primary rounded-lg hover:opacity-90 text-sm font-medium bg-gradient-to-br from-primary to-primary-dim active:scale-[0.98] transition-all disabled:opacity-50"
      >
        {setupMutation.isPending ? 'Loading...' : 'Enable 2FA'}
      </button>
    </div>
  )
}
