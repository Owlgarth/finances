import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { authApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

type State = 'loading' | 'success' | 'error'

export default function ConfirmEmailChangePage() {
  const [searchParams] = useSearchParams()
  const [state, setState] = useState<State>('loading')
  const { updateUser } = useAuth()

  useEffect(() => {
    const confirm = async () => {
      const token = searchParams.get('token')
      if (!token) {
        setState('error')
        return
      }

      try {
        await authApi.confirmEmailChange(token)
        try {
          const updatedUser = await authApi.getCurrentUser()
          updateUser(updatedUser)
        } catch {
          // Non-critical: confirmation succeeded, but context refresh failed.
        }
        setState('success')
      } catch {
        setState('error')
      }
    }

    confirm()
  }, [searchParams, updateUser])

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-surface-container-lowest rounded-xl p-8 w-full max-w-md" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="text-center mb-8">
          <h2 className="font-headline font-black text-primary text-3xl tracking-tight">
            Monie
          </h2>
        </div>

        <div className="text-center">
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-on-surface-variant">Confirming email change...</p>
            </div>
          )}

          {state === 'success' && (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-headline font-bold text-on-surface text-lg">Email Changed Successfully</h3>
              <p className="text-sm text-on-surface-variant">Your email has been updated.</p>
              <Link
                to="/"
                className="inline-block px-4 py-2 text-sm font-medium rounded-lg text-on-primary bg-gradient-to-br from-primary to-primary-dim hover:opacity-90 active:scale-[0.98] transition-all"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="font-headline font-bold text-on-surface text-lg">Invalid or Expired Link</h3>
              <p className="text-sm text-on-surface-variant">
                This email change link is invalid or has expired.
              </p>
              <Link
                to="/profile"
                className="text-primary hover:text-primary-dim text-sm font-medium"
              >
                Go to Settings
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
