import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import type { User } from '../../types'
import { authApi } from '../../api/client'
import { getApiErrorMessage } from '../../utils/errors'
import EmailVerificationBadge from './EmailVerificationBadge'

interface Props {
  user: User
  onSubmit: (data: { full_name?: string }) => void
  isLoading: boolean
}

export default function EditProfileForm({ user, onSubmit, isLoading }: Props) {
  const { t } = useTranslation('settings')
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

  const handleChangeEmail = async () => {
    if (!newEmail || !password) return

    setIsChangingEmail(true)
    try {
      await authApi.requestEmailChange(password, newEmail)
      toast.success(t('editProfile.emailSent'))
      setShowChangeEmail(false)
      setNewEmail('')
      setPassword('')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('editProfile.emailFailed')))
    } finally {
      setIsChangingEmail(false)
    }
  }

  // Enter inside the change-email inputs must submit the email change, not the
  // outer profile form (implicit submission - the confirm button is
  // type="button").
  const handleEmailKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || isChangingEmail) return
    e.preventDefault()
    handleChangeEmail()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="full_name" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          {t('editProfile.fullNameLabel')}
        </label>
        <input
          type="text"
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full bg-surface-hover border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
          placeholder={t('editProfile.fullNamePlaceholder')}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted">
            {t('editProfile.emailLabel')}
          </label>
          <EmailVerificationBadge verified={user.email_verified} email={user.email} />
        </div>
        <div className="flex items-center gap-3">
          <span className="flex-1 bg-surface-hover rounded-none px-3 py-2 font-mono text-sm text-text">
            {user.email}
          </span>
          {!showChangeEmail && (
            <button
              type="button"
              onClick={() => setShowChangeEmail(true)}
              className="text-sm font-medium text-primary hover:text-primary-hover whitespace-nowrap"
            >
              {t('editProfile.changeEmail')}
            </button>
          )}
        </div>

        {showChangeEmail && (
          <div className="mt-3 p-4 bg-surface-hover rounded-sm border border-border space-y-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={handleEmailKeyDown}
              className="w-full bg-surface border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder={t('editProfile.newEmailPlaceholder')}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleEmailKeyDown}
              className="w-full bg-surface border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder={t('editProfile.currentPasswordPlaceholder')}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleChangeEmail}
                disabled={isChangingEmail}
                className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {isChangingEmail ? t('editProfile.confirming') : t('editProfile.confirm')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowChangeEmail(false)
                  setNewEmail('')
                  setPassword('')
                }}
                className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
              >
                {t('editProfile.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? t('editProfile.saving') : t('editProfile.save')}
        </button>
      </div>
    </form>
  )
}
