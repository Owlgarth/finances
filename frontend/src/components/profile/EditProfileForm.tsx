import { useState } from 'react'
import toast from 'react-hot-toast'
import type { User } from '../../types'
import { authApi } from '../../api/client'
import EmailVerificationBadge from './EmailVerificationBadge'

interface Props {
  user: User
  onSubmit: (data: { full_name?: string }) => void
  isLoading: boolean
}

export default function EditProfileForm({ user, onSubmit, isLoading }: Props) {
  const [fullName, setFullName] = useState(user.full_name || '')
  const [showChangeEmail, setShowChangeEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isChangingEmail, setIsChangingEmail] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (fullName !== user.full_name) {
      onSubmit({ full_name: fullName })
    }
  }

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail || !password) return

    setIsChangingEmail(true)
    try {
      await authApi.requestEmailChange(password, newEmail)
      toast.success('Check your new email for confirmation')
      setShowChangeEmail(false)
      setNewEmail('')
      setPassword('')
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      toast.error(err.response?.data?.detail || 'Failed to request email change')
    } finally {
      setIsChangingEmail(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="full_name" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">
          Full Name
        </label>
        <input
          type="text"
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
          placeholder="Enter your full name"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block font-mono text-[9px] uppercase tracking-widest text-outline">
            Email Address
          </label>
          <EmailVerificationBadge verified={user.email_verified} email={user.email} />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex-1 bg-surface-container-highest rounded-lg px-3 py-2 font-mono text-sm text-on-surface">
            {user.email}
          </span>
          {!showChangeEmail && (
            <button
              type="button"
              onClick={() => setShowChangeEmail(true)}
              className="text-sm font-medium text-primary hover:text-primary-dim whitespace-nowrap"
            >
              Change Email
            </button>
          )}
        </div>

        {showChangeEmail && (
          <div className="mt-3 p-4 bg-surface-container-highest rounded-lg space-y-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-surface-container-lowest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              placeholder="New email address"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface-container-lowest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              placeholder="Current password"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleChangeEmail}
                disabled={isChangingEmail}
                className="px-4 py-2 text-sm font-medium rounded-lg text-on-primary bg-gradient-to-br from-primary to-primary-dim hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {isChangingEmail ? 'Sending...' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowChangeEmail(false)
                  setNewEmail('')
                  setPassword('')
                }}
                className="px-4 py-2 text-sm font-medium rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2.5 text-on-primary rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary-container focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium bg-gradient-to-br from-primary to-primary-dim active:scale-[0.98]"
        >
          {isLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
