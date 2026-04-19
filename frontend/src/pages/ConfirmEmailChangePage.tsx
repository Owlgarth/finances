import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CircleCheck, CircleX } from 'lucide-react'
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
              <p className="text-sm text-text-muted">Confirming email change...</p>
            </div>
          )}

          {state === 'success' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <CircleCheck size={16} className="text-positive" />
              </div>
              <h3 className="font-sans font-medium text-text text-sm">Email Changed Successfully</h3>
              <p className="text-sm text-text-muted">Your email has been updated.</p>
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
                This email change link is invalid or has expired.
              </p>
              <Link
                to="/profile"
                className="text-primary hover:text-primary-hover text-sm font-medium"
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
