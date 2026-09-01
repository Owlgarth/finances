import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { authApi } from '../../api/client'
import { getApiErrorMessage } from '../../utils/errors'

export default function ChangePasswordForm() {
  const { t } = useTranslation('settings')
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success(t('changePassword.success'))
      setFormData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('changePassword.failed')))
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.newPassword.length < 6) {
      setError(t('changePassword.tooShort'))
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError(t('changePassword.mismatch'))
      return
    }

    changePasswordMutation.mutate({
      currentPassword: formData.currentPassword,
      newPassword: formData.newPassword
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="current_password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          {t('changePassword.currentLabel')}
        </label>
        <input
          type="password"
          id="current_password"
          value={formData.currentPassword}
          onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
          className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all"
          placeholder={t('changePassword.currentPlaceholder')}
          required
        />
      </div>

      <div>
        <label htmlFor="new_password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          {t('changePassword.newLabel')}
        </label>
        <input
          type="password"
          id="new_password"
          value={formData.newPassword}
          onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
          className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all"
          placeholder={t('changePassword.newPlaceholder')}
          required
          minLength={6}
        />
        <p className="mt-1 text-sm text-text-muted">{t('changePassword.helper')}</p>
      </div>

      <div>
        <label htmlFor="confirm_password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          {t('changePassword.confirmLabel')}
        </label>
        <input
          type="password"
          id="confirm_password"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all"
          placeholder={t('changePassword.confirmPlaceholder')}
          required
          minLength={6}
        />
      </div>

      {error && (
        <div className="rounded-sm bg-negative-bg p-4">
          <div className="text-sm text-negative">{error}</div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={changePasswordMutation.isPending}
          className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {changePasswordMutation.isPending ? t('changePassword.submitting') : t('changePassword.submit')}
        </button>
      </div>
    </form>
  )
}
