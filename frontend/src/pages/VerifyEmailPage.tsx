import { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CircleCheck, CircleX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { authApi, getAuthToken } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

type State = 'loading' | 'success' | 'error' | 'resend' | 'resend-success' | 'resend-error'

export default function VerifyEmailPage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('loading')
  const [resendEmail, setResendEmail] = useState('')
  const [isResending, setIsResending] = useState(false)
  const { updateUser } = useAuth()

  // Belt-and-suspenders: read updateUser through a ref so its identity never
  // re-triggers the verify effect (AuthContext memoizes it too, but this page
  // stays correct regardless).
  const updateUserRef = useRef(updateUser)
  useEffect(() => {
    updateUserRef.current = updateUser
  }, [updateUser])

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token')
      if (!token) {
        setState('error')
        return
      }

      try {
        await authApi.verifyEmail(token)
        // Only refresh the user context when actually logged in — an
        // anonymous visitor has no token and getCurrentUser() would 401 and
        // redirect to /login via the interceptor, hiding the success screen.
        if (getAuthToken()) {
          try {
            const updatedUser = await authApi.getCurrentUser()
            updateUserRef.current(updatedUser)
          } catch {
            // Non-critical: verification succeeded, context refresh failed
          }
        }
        setState('success')
      } catch {
        setState('error')
      }
    }

    verify()
  }, [searchParams])

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resendEmail) return

    setIsResending(true)
    try {
      await authApi.resendVerification(resendEmail)
      setState('resend-success')
    } catch {
      setState('resend-error')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-surface border border-border rounded-sm p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="font-sans font-semibold text-text text-base tracking-tight">
            Owlgarth Finances
          </h2>
        </div>

        <div className="text-center">
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-sm bg-primary animate-pulse" />
              <p className="text-sm text-text-muted">{t('verifyEmail.loading')}</p>
            </div>
          )}

          {state === 'success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleCheck size={16} className="text-positive" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">{t('verifyEmail.successTitle')}</h3>
              <p className="text-sm text-text-muted">{t('verifyEmail.successBody')}</p>
              <Link
                to="/"
                className="inline-block bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors"
              >
                {t('shared.goToDashboard')}
              </Link>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleX size={16} className="text-negative" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">{t('shared.invalidLinkTitle')}</h3>
              <p className="text-sm text-text-muted">
                {t('verifyEmail.errorBody')}
              </p>
              <button
                type="button"
                onClick={() => setState('resend')}
                className="text-primary hover:text-primary-hover text-sm font-medium"
              >
                {t('verifyEmail.resendLink')}
              </button>
            </div>
          )}

          {state === 'resend' && (
            <form onSubmit={handleResend} className="space-y-4">
              <h3 className="font-sans font-medium text-text text-sm">{t('verifyEmail.resendTitle')}</h3>
              <p className="text-sm text-text-muted">{t('verifyEmail.resendBody')}</p>
              <input
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
                placeholder={t('verifyEmail.resendPlaceholder')}
              />
              <button
                type="submit"
                disabled={isResending}
                className="w-full bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {isResending ? t('verifyEmail.sending') : t('verifyEmail.sendButton')}
              </button>
            </form>
          )}

          {state === 'resend-success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleCheck size={16} className="text-positive" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">{t('verifyEmail.resendSuccessTitle')}</h3>
              <p className="text-sm text-text-muted">
                {t('verifyEmail.resendSuccessBody')}
              </p>
            </div>
          )}

          {state === 'resend-error' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleX size={16} className="text-negative" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">{t('shared.somethingWentWrong')}</h3>
              <p className="text-sm text-text-muted">
                {t('verifyEmail.resendErrorBody')}
              </p>
              <button
                type="button"
                onClick={() => setState('resend')}
                className="text-primary hover:text-primary-hover text-sm font-medium"
              >
                {t('shared.tryAgain')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
