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

type Tab = 'profile' | 'password' | 'preferences' | 'account'

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
    mutationFn: (data: { full_name?: string; email?: string }) =>
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
      <h1 className="font-headline font-extrabold tracking-tight text-3xl text-on-surface mb-8">Profile Settings</h1>

      <div className="bg-surface-container-lowest rounded-xl" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="py-3 px-3">
          <nav className="flex flex-wrap gap-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-2.5 px-4 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'profile'
                  ? 'bg-surface-container-high text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`py-2.5 px-4 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'password'
                  ? 'bg-surface-container-high text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
            >
              Password
            </button>
            <button
              onClick={() => setActiveTab('preferences')}
              className={`py-2.5 px-4 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'preferences'
                  ? 'bg-surface-container-high text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
              }`}
            >
              Preferences
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`py-2.5 px-4 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'account'
                  ? 'bg-surface-container-high text-on-surface'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
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
                <h3 className="font-headline font-bold text-on-surface text-lg mb-2">Export Your Data</h3>
                <p className="text-sm text-on-surface-variant mb-4">
                  Download a complete copy of all your personal data in JSON format.
                  This includes your profile, preferences, all transactions, budgets, and workspace data.
                </p>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="px-4 py-2 text-on-primary rounded-lg hover:opacity-90 text-sm font-medium bg-gradient-to-br from-primary to-primary-dim disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  {isExporting ? 'Exporting...' : 'Export All My Data'}
                </button>
              </div>

              <div className="bg-[rgba(158,63,78,0.04)] rounded-xl p-6">
                <DeleteAccountSection />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
