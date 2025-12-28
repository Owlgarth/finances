import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { workspaceMembersApi, workspacesApi, authApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import toast from 'react-hot-toast'
import Loading from '../components/common/Loading'
import EmptyState from '../components/common/EmptyState'
import ConfirmDialog from '../components/common/ConfirmDialog'
import type { WorkspaceMember, AddMemberRequest } from '../types'
import { HiUserAdd, HiTrash, HiPencil, HiShieldCheck, HiUser, HiEye, HiStar, HiKey } from 'react-icons/hi'

export default function WorkspaceMembersPage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null)
  const [removingMember, setRemovingMember] = useState<WorkspaceMember | null>(null)
  const [resetPasswordMember, setResetPasswordMember] = useState<WorkspaceMember | null>(null)
  const [isChangeMyPasswordModalOpen, setIsChangeMyPasswordModalOpen] = useState(false)
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // Get current workspace
  const { data: workspace, isLoading: workspaceLoading } = useQuery({
    queryKey: ['workspace-current'],
    queryFn: workspacesApi.getCurrent,
  })

  const workspaceId = workspace?.id

  // Get workspace members
  const { data: members, isLoading: membersLoading, error } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceMembersApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  const { canManageMembers, canResetPasswordFor, isOwner } = usePermissions()

  const addMutation = useMutation({
    mutationFn: (data: AddMemberRequest) => workspaceMembersApi.add(workspaceId!, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      if (data.is_new_user) {
        toast.success('New user created and added to workspace')
      } else {
        toast.success('Existing user added to workspace')
      }
      setIsAddModalOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to add member')
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      workspaceMembersApi.updateRole(workspaceId!, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      toast.success('Role updated')
      setEditingMember(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update role')
    },
  })

  const removeMutation = useMutation({
    mutationFn: (userId: number) => workspaceMembersApi.remove(workspaceId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      toast.success('Member removed')
      setRemovingMember(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to remove member')
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, newPassword }: { userId: number; newPassword: string }) =>
      workspaceMembersApi.resetPassword(workspaceId!, userId, newPassword),
    onSuccess: (data) => {
      toast.success(`Password reset successfully for ${data.email}`)
      setResetPasswordMember(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to reset password')
    },
  })

  const changeMyPasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Your password has been changed successfully')
      setIsChangeMyPasswordModalOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to change password')
    },
  })

  if (workspaceLoading || membersLoading) return <Loading />
  if (error) return <div className="text-red-600 p-4">Failed to load workspace members</div>

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">Workspace Members</h1>
          <p className="text-gray-600 mt-1">{workspace?.name}</p>
        </div>
        <div className="flex gap-2">
          {isOwner && (
            <button
              onClick={() => setIsChangeMyPasswordModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
              title="Change My Password"
            >
              <HiKey className="h-5 w-5" />
              <span className="hidden sm:inline">Change My Password</span>
            </button>
          )}
          {canManageMembers && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <HiUserAdd className="h-5 w-5" />
              <span className="hidden sm:inline">Add Member</span>
            </button>
          )}
        </div>
      </div>

      {members && members.length === 0 ? (
        <EmptyState
          message="No members in this workspace yet."
        />
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                {canManageMembers && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {members?.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isCurrentUser={member.user_id === user?.id}
                  canManage={canManageMembers && member.role !== 'owner' && member.user_id !== user?.id}
                  canResetPassword={canResetPasswordFor(member)}
                  isOwner={isOwner}
                  onEditRole={() => setEditingMember(member)}
                  onRemove={() => setRemovingMember(member)}
                  onResetPassword={() => setResetPasswordMember(member)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <AddMemberModal
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={(data) => addMutation.mutate(data)}
          isSubmitting={addMutation.isPending}
        />
      )}

      {/* Edit Role Modal */}
      {editingMember && (
        <EditRoleModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSubmit={(role) => updateRoleMutation.mutate({ userId: editingMember.user_id, role })}
          isSubmitting={updateRoleMutation.isPending}
        />
      )}

      {/* Remove Confirmation */}
      <ConfirmDialog
        isOpen={!!removingMember}
        title="Remove Member"
        message={removingMember ? `Are you sure you want to remove "${removingMember.email}" from this workspace? They will lose access to all workspace data.` : ''}
        onConfirm={() => removingMember && removeMutation.mutate(removingMember.user_id)}
        onCancel={() => setRemovingMember(null)}
      />

      {/* Reset Password Modal */}
      {resetPasswordMember && (
        <ResetPasswordModal
          member={resetPasswordMember}
          onClose={() => setResetPasswordMember(null)}
          onSubmit={(newPassword) => resetPasswordMutation.mutate({
            userId: resetPasswordMember.user_id,
            newPassword
          })}
          isSubmitting={resetPasswordMutation.isPending}
        />
      )}

      {/* Change My Password Modal */}
      {isChangeMyPasswordModalOpen && (
        <ChangeMyPasswordModal
          onClose={() => setIsChangeMyPasswordModalOpen(false)}
          onSubmit={(currentPassword, newPassword) => changeMyPasswordMutation.mutate({
            currentPassword,
            newPassword
          })}
          isSubmitting={changeMyPasswordMutation.isPending}
        />
      )}
    </div>
  )
}

function getRoleIcon(role: string) {
  switch (role) {
    case 'owner':
      return <HiStar className="h-4 w-4 text-yellow-500" />
    case 'admin':
      return <HiShieldCheck className="h-4 w-4 text-blue-500" />
    case 'member':
      return <HiUser className="h-4 w-4 text-green-500" />
    case 'viewer':
      return <HiEye className="h-4 w-4 text-gray-500" />
    default:
      return <HiUser className="h-4 w-4 text-gray-500" />
  }
}

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'owner':
      return 'bg-yellow-100 text-yellow-800'
    case 'admin':
      return 'bg-blue-100 text-blue-800'
    case 'member':
      return 'bg-green-100 text-green-800'
    case 'viewer':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

interface MemberRowProps {
  member: WorkspaceMember
  isCurrentUser: boolean
  canManage: boolean
  canResetPassword: boolean
  isOwner: boolean
  onEditRole: () => void
  onRemove: () => void
  onResetPassword: () => void
}

function MemberRow({ member, isCurrentUser, canManage, canResetPassword, isOwner, onEditRole, onRemove, onResetPassword }: MemberRowProps) {
  const canEditThisMember = canManage && (isOwner || member.role !== 'admin')
  const showActions = canEditThisMember || canResetPassword

  return (
    <tr className={isCurrentUser ? 'bg-blue-50' : ''}>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-gray-600 font-medium">
              {member.email[0].toUpperCase()}
            </span>
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
              {member.full_name || member.email}
              {isCurrentUser && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">You</span>
              )}
            </div>
            {member.full_name && (
              <div className="text-sm text-gray-500">{member.email}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(member.role)}`}>
          {getRoleIcon(member.role)}
          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
          member.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {member.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      {(canManage || showActions) && (
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          {showActions && (
            <div className="flex justify-end gap-2">
              {canEditThisMember && (
                <button
                  onClick={onEditRole}
                  className="p-1.5 text-gray-500 hover:text-blue-600 transition-colors"
                  title="Edit Role"
                >
                  <HiPencil className="h-4 w-4" />
                </button>
              )}
              {canResetPassword && (
                <button
                  onClick={onResetPassword}
                  className="p-1.5 text-gray-500 hover:text-yellow-600 transition-colors"
                  title="Reset Password"
                >
                  <HiKey className="h-4 w-4" />
                </button>
              )}
              {canEditThisMember && (
                <button
                  onClick={onRemove}
                  className="p-1.5 text-gray-500 hover:text-red-600 transition-colors"
                  title="Remove"
                >
                  <HiTrash className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </td>
      )}
    </tr>
  )
}

interface AddMemberModalProps {
  onClose: () => void
  onSubmit: (data: AddMemberRequest) => void
  isSubmitting: boolean
}

function AddMemberModal({ onClose, onSubmit, isSubmitting }: AddMemberModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      email,
      password,
      role,
      full_name: fullName || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4">Add Member</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Minimum 8 characters"
            />
            <p className="text-xs text-gray-500 mt-1">
              User can change this password after first login
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Doe (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role *
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member' | 'viewer')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="viewer">Viewer - Can view all data</option>
              <option value="member">Member - Can view and edit data</option>
              <option value="admin">Admin - Can manage members and settings</option>
            </select>
          </div>

          <p className="text-xs text-gray-500">
            If a user with this email already exists, they will be added to the workspace (password ignored).
          </p>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface EditRoleModalProps {
  member: WorkspaceMember
  onClose: () => void
  onSubmit: (role: string) => void
  isSubmitting: boolean
}

function EditRoleModal({ member, onClose, onSubmit, isSubmitting }: EditRoleModalProps) {
  const [role, setRole] = useState(member.role)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(role)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-4">Change Role</h2>
        <p className="text-gray-600 mb-4">
          Update role for <strong>{member.full_name || member.email}</strong>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'member' | 'viewer')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="viewer">Viewer - Can view all data</option>
              <option value="member">Member - Can view and edit data</option>
              <option value="admin">Admin - Can manage members and settings</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting || role === member.role}
            >
              {isSubmitting ? 'Updating...' : 'Update Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ResetPasswordModalProps {
  member: WorkspaceMember
  onClose: () => void
  onSubmit: (newPassword: string) => void
  isSubmitting: boolean
}

function ResetPasswordModal({ member, onClose, onSubmit, isSubmitting }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    onSubmit(newPassword)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-2">Reset Password</h2>
        <p className="text-gray-600 mb-4">
          Resetting password for <strong>{member.full_name || member.email}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Confirm new password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-800">
              The user will need to log in with this new password. Please share it with them securely.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ChangeMyPasswordModalProps {
  onClose: () => void
  onSubmit: (currentPassword: string, newPassword: string) => void
  isSubmitting: boolean
}

function ChangeMyPasswordModal({ onClose, onSubmit, isSubmitting }: ChangeMyPasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!currentPassword) {
      setError('Current password is required')
      return
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password')
      return
    }

    onSubmit(currentPassword, newPassword)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-semibold mb-2">Change My Password</h2>
        <p className="text-gray-600 mb-4">
          Update your account password
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Current Password *
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter current password"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter new password"
              autoComplete="new-password"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum 8 characters
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              You will remain logged in after changing your password.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
