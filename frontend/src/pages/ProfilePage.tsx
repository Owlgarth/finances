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
      // Update user state in context with returned data
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
      // Clear password form fields
      const form = document.getElementById('change-password-form') as HTMLFormElement
      if (form) form.reset()
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to change password'
      toast.error(message)
    }
  })

  const updatePreferencesMutation = useMutation({
    mutationFn: (data: { calendar_start_day: number }) =>
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
      <h1 className="text-3xl font-semibold text-gray-900 mb-8">Profile Settings</h1>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'profile'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Profile Information
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'password'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Change Password
            </button>
            <button
              onClick={() => setActiveTab('preferences')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'preferences'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Preferences
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'account'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
                <h3 className="text-lg font-medium text-gray-900 mb-2">Export Your Data</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Download a complete copy of all your personal data in JSON format.
                  This includes your profile, preferences, all transactions, budgets, and workspace data.
                </p>
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 text-sm font-medium"
                >
                  {isExporting ? 'Exporting...' : 'Export All My Data'}
                </button>
              </div>

              <hr className="border-gray-200" />

              <DeleteAccountSection />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}