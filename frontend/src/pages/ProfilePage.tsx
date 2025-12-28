import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import EditProfileForm from '../components/profile/EditProfileForm'
import ChangePasswordForm from '../components/profile/ChangePasswordForm'

type Tab = 'profile' | 'password'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('profile')

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
        </div>
      </div>
    </div>
  )
}