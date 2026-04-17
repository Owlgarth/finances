import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import EditProfileForm from '../components/profile/EditProfileForm'
import ChangePasswordForm from '../components/profile/ChangePasswordForm'
import PreferencesForm from '../components/profile/PreferencesForm'
import DeleteAccountSection from '../components/profile/DeleteAccountSection'
import TwoFactorSection from '../components/profile/TwoFactorSection'

type Tab = 'profile' | 'password' | 'security' | 'preferences' | 'account'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const { preferences } = useUserPreferences()
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const queryClient = useQueryClient()
  const [isExporting, setIsExporting] = useState(false)

  const handleExportData = async () => {
    setIsExporting(true)
    try {
      const blob = await authApi.exportData()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `monie_data_export_${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('Data exported successfully!')
    } catch {
      toast.error('Failed to export data. Please try again later.')
    } finally {
      setIsExporting(false)
    }
  }

  const updateProfileMutation = useMutation({
    mutationFn: (data: { full_name?: string }) =>
      authApi.updateProfile(data),
    onSuccess: (updatedUser) => {
      updateUser(updatedUser)
      toast.success('Profile updated successfully!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to update profile'
      toast.error(message)
    }
  })

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed successfully!')
      const form = document.getElementById('change-password-form') as HTMLFormElement
      if (form) form.reset()
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to change password'
      toast.error(message)
    }
  })

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: { calendar_start_day: number; font_family: string }) =>
      authApi.updatePreferences(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] })
      toast.success('Preferences updated successfully!')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to update preferences'
      toast.error(message)
    }
  })

  if (!user) {
    return null
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-base font-semibold text-text mb-8">Profile Settings</h1>

      <div className="bg-surface border border-border rounded-sm">
        <div className="py-3 px-3">
          <nav className="flex flex-wrap gap-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-2.5 px-4 text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'profile'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`py-2.5 px-4 text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'password'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`py-2.5 px-4 text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'security'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Security
            </button>
            <button
              onClick={() => setActiveTab('preferences')}
              className={`py-2.5 px-4 text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'preferences'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Preferences
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`py-2.5 px-4 text-sm font-medium rounded-sm transition-colors ${
                activeTab === 'account'
                  ? 'bg-surface-hover text-text'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover'
              }`}
            >
              Account
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'profile' && (
            <EditProfileForm
              user={user}
              onSubmit={(data) => updateProfileMutation.mutate(data)}
              isLoading={updateProfileMutation.isPending}
            />
          )}

          {activeTab === 'password' && (
            <ChangePasswordForm
              onSubmit={({ currentPassword, newPassword }) =>
                changePasswordMutation.mutate({ currentPassword, newPassword })
              }
              isLoading={changePasswordMutation.isPending}
            />
          )}

          <div className={activeTab === 'security' ? '' : 'hidden'}>
            <TwoFactorSection />
          </div>

          {activeTab === 'preferences' && (
            <PreferencesForm
              preferences={preferences || null}
              onSubmit={(data) => updatePreferencesMutation.mutate(data)}
              isLoading={updatePreferencesMutation.isPending}
            />
          )}

          {activeTab === 'account' && (
            <div className="space-y-10">
              <div>
                <h3 className="text-sm font-medium text-text mb-2">Export Your Data</h3>
                <p className="text-sm text-text-muted mb-4">
                  Download a complete copy of all your personal data in JSON format.
                  This includes your profile, preferences, all transactions, budgets, and workspace data.
                </p>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
                >
                  {isExporting ? 'Exporting...' : 'Export All My Data'}
                </button>
              </div>

              <div className="bg-negative-bg rounded-sm border border-border p-6">
                <DeleteAccountSection />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
