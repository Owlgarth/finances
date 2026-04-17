import { useState } from 'react'

interface Props {
  onSubmit: (data: { currentPassword: string; newPassword: string }) => void
  isLoading: boolean
}

export default function ChangePasswordForm({ onSubmit, isLoading }: Props) {
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.newPassword.length < 6) {
      setError('New password must be at least 6 characters long')
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setError('New password and confirmation do not match')
      return
    }

    onSubmit({
      currentPassword: formData.currentPassword,
      newPassword: formData.newPassword
    })

    setFormData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
  }

  return (
    <form id="change-password-form" onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="current_password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          Current Password
        </label>
        <input
          type="password"
          id="current_password"
          value={formData.currentPassword}
          onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
          className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all"
          placeholder="Enter your current password"
          required
        />
      </div>

      <div>
        <label htmlFor="new_password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          New Password
        </label>
        <input
          type="password"
          id="new_password"
          value={formData.newPassword}
          onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
          className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all"
          placeholder="Enter your new password"
          required
          minLength={6}
        />
        <p className="mt-1 text-sm text-text-muted">Password must be at least 6 characters long</p>
      </div>

      <div>
        <label htmlFor="confirm_password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          Confirm New Password
        </label>
        <input
          type="password"
          id="confirm_password"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-all"
          placeholder="Confirm your new password"
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
          disabled={isLoading}
          className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Changing Password...' : 'Change Password'}
        </button>
      </div>
    </form>
  )
}
