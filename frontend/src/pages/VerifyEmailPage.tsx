import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CircleCheck, CircleX } from 'lucide-react'
import { authApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

type State = 'loading' | 'success' | 'error' | 'resend' | 'resend-success' | 'resend-error'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('loading')
  const [resendEmail, setResendEmail] = useState('')
  const [isResending, setIsResending] = useState(false)
  const { updateUser } = useAuth()

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token')
      if (!token) {
        setState('error')
        return
      }

      try {
        await authApi.verifyEmail(token)
        try {
          const updatedUser = await authApi.getCurrentUser()
          updateUser(updatedUser)
        } catch {
          // Non-critical: verification succeeded, context refresh failed
        }
        setState('success')
      } catch {
        setState('error')
      }
    }

    verify()
  }, [searchParams, updateUser])

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
            Moniteria
          </h2>
        </div>

        <div className="text-center">
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-sm animate-spin" />
              <p className="text-sm text-text-muted">Verifying your email...</p>
            </div>
          )}

          {state === 'success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleCheck size={16} className="text-positive" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">Email Verified!</h3>
              <p className="text-sm text-text-muted">You can now close this page.</p>
              <Link
                to="/"
                className="inline-block bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleX size={16} className="text-negative" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">Invalid or Expired Link</h3>
              <p className="text-sm text-text-muted">
                This verification link is invalid or has expired.
              </p>
              <button
                type="button"
                onClick={() => setState('resend')}
                className="text-primary hover:text-primary-hover text-sm font-medium"
              >
                Resend verification email
              </button>
            </div>
          )}

          {state === 'resend' && (
            <form onSubmit={handleResend} className="space-y-4">
              <h3 className="font-sans font-medium text-text text-sm">Resend Verification</h3>
              <p className="text-sm text-text-muted">Enter your email to receive a new verification link.</p>
              <input
                type="email"
                required
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
                className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
                placeholder="Enter your email address"
              />
              <button
                type="submit"
                disabled={isResending}
                className="w-full bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {isResending ? 'Sending...' : 'Send Verification Email'}
              </button>
            </form>
          )}

          {state === 'resend-success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleCheck size={16} className="text-positive" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">Check Your Email</h3>
              <p className="text-sm text-text-muted">
                If your email is unverified, a new verification email has been sent.
              </p>
            </div>
          )}

          {state === 'resend-error' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleX size={16} className="text-negative" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">Something went wrong</h3>
              <p className="text-sm text-text-muted">
                Could not send verification email. Please try again later.
              </p>
              <button
                type="button"
                onClick={() => setState('resend')}
                className="text-primary hover:text-primary-hover text-sm font-medium"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
