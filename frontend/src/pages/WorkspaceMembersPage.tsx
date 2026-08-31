import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  KeyRound,
  UserPlus,
  Star,
  Shield,
  ShieldOff,
  User,
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { workspaceMembersApi, authApi } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { usePermissions } from '../hooks/usePermissions'
import { useBreakpoint } from '../hooks/useBreakpoint'
import Skeleton from '../components/common/Skeleton'
import EmptyState from '../components/common/EmptyState'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Modal from '../components/common/Modal'
import Select from '../components/common/Select'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'
import { getApiErrorMessage } from '../utils/errors'
import { tappableProps } from '../utils/tappable'
import type { WorkspaceMember, AddMemberRequest } from '../types'

export default function WorkspaceMembersPage() {
  const { t } = useTranslation('members')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null)
  const [removingMember, setRemovingMember] = useState<WorkspaceMember | null>(null)
  const [resetPasswordMember, setResetPasswordMember] = useState<WorkspaceMember | null>(null)
  const [resetting2FA, setResetting2FA] = useState<WorkspaceMember | null>(null)
  const [isChangeMyPasswordModalOpen, setIsChangeMyPasswordModalOpen] = useState(false)
  // Mobile card list: tap → action sheet (plan decision 7).
  const [actionMember, setActionMember] = useState<WorkspaceMember | null>(null)
  const { isMobile } = useBreakpoint()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { workspace, isLoading: workspaceLoading } = useWorkspace()
  const workspaceId = workspace?.id

  // Get workspace members
  const { data: members, isLoading: membersLoading, error } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceMembersApi.list(workspaceId!),
    enabled: !!workspaceId,
  })

  const { canManageMembers, canResetPasswordFor, canEditMember } = usePermissions()

  const addMutation = useMutation({
    mutationFn: (data: AddMemberRequest) => workspaceMembersApi.add(workspaceId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      toast.success(t('toasts.memberAdded'))
      setIsAddModalOpen(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('toasts.addFailed'))),
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: string }) =>
      workspaceMembersApi.updateRole(workspaceId!, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      toast.success(t('toasts.roleUpdated'))
      setEditingMember(null)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('toasts.roleUpdateFailed'))),
  })

  const removeMutation = useMutation({
    mutationFn: (userId: number) => workspaceMembersApi.remove(workspaceId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      toast.success(t('toasts.memberRemoved'))
      setRemovingMember(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('toasts.removeFailed')))
      setRemovingMember(null)
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, newPassword }: { userId: number; newPassword: string }) =>
      workspaceMembersApi.resetPassword(workspaceId!, userId, newPassword),
    onSuccess: (data) => {
      toast.success(t('toasts.passwordReset', { email: data.email }))
      setResetPasswordMember(null)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('toasts.passwordResetFailed'))),
  })

  const reset2FAMutation = useMutation({
    mutationFn: (userId: number) => workspaceMembersApi.reset2FA(workspaceId!, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
      toast.success(t('toasts.twoFactorReset'))
      setResetting2FA(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('toasts.twoFactorResetFailed')))
      setResetting2FA(null)
    },
  })

  const changeMyPasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success(t('toasts.ownPasswordChanged'))
      setIsChangeMyPasswordModalOpen(false)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('toasts.ownPasswordChangeFailed'))),
  })

  if (workspaceLoading || membersLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
        <div className="bg-surface rounded-sm overflow-hidden border border-border">
          <div className="bg-surface-hover px-6 py-3">
            <div className="grid grid-cols-4 gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-14 ml-auto" />
            </div>
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-6 py-4 grid grid-cols-4 gap-4 items-center">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 flex-shrink-0" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                </div>
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-16" />
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-5 w-5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  if (error) return <div className="text-negative p-4">{t('page.loadError')}</div>

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-base font-semibold text-text">{t('page.title')}</h1>
          <p className="text-text-muted mt-1">{workspace?.name}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsChangeMyPasswordModalOpen(true)}
            className={`flex items-center gap-2 ${secondaryButtonClass}`}
            title={t('page.changeMyPassword')}
          >
            <KeyRound size={14} />
            <span className="hidden sm:inline">{t('page.changeMyPassword')}</span>
          </button>
          {canManageMembers && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className={`flex items-center gap-2 ${primaryButtonClass}`}
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">{t('page.addMember')}</span>
            </button>
          )}
        </div>
      </div>

      {members && members.length === 0 ? (
        <EmptyState
          message={t('page.empty')}
        />
      ) : isMobile ? (
        /* Mobile: card list, tap → action sheet - the 4-column table can't fit 375px. */
        <div className="bg-surface rounded-sm border border-border divide-y divide-border">
          {members?.map((member) => {
            const tappable = canEditMember(member) || canResetPasswordFor(member)
            return (
              <MemberCard
                key={member.id}
                member={member}
                isCurrentUser={member.user_id === user?.id}
                tappable={tappable}
                onTap={() => setActionMember(member)}
              />
            )
          })}
        </div>
      ) : (
        <div className="bg-surface rounded-sm overflow-hidden border border-border">
          <table className="min-w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-6 py-3 text-left font-mono text-[9px] uppercase tracking-widest text-text-muted">
                  {t('table.user')}
                </th>
                <th className="px-6 py-3 text-left font-mono text-[9px] uppercase tracking-widest text-text-muted">
                  {t('table.role')}
                </th>
                <th className="px-6 py-3 text-left font-mono text-[9px] uppercase tracking-widest text-text-muted">
                  {t('table.status')}
                </th>
                {canManageMembers && (
                  <th className="px-6 py-3 text-right font-mono text-[9px] uppercase tracking-widest text-text-muted">
                    {t('table.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {members?.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  isCurrentUser={member.user_id === user?.id}
                  canResetPassword={canResetPasswordFor(member)}
                  canReset2FA={canResetPasswordFor(member)}
                  onEditRole={() => setEditingMember(member)}
                  onRemove={() => setRemovingMember(member)}
                  onResetPassword={() => setResetPasswordMember(member)}
                  onReset2FA={() => setResetting2FA(member)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile member actions */}
      <ActionSheet
        open={!!actionMember}
        onClose={() => setActionMember(null)}
        title={actionMember?.full_name || actionMember?.email}
        actions={
          actionMember
            ? [
                ...(canEditMember(actionMember)
                  ? [{ label: t('sheet.editRole'), icon: Pencil, onSelect: () => setEditingMember(actionMember) }]
                  : []),
                ...(canResetPasswordFor(actionMember)
                  ? [{ label: t('sheet.resetPassword'), icon: KeyRound, onSelect: () => setResetPasswordMember(actionMember) }]
                  : []),
                ...(canResetPasswordFor(actionMember)
                  ? [{ label: t('sheet.reset2fa'), icon: ShieldOff, onSelect: () => setResetting2FA(actionMember) }]
                  : []),
                ...(canEditMember(actionMember)
                  ? [{ label: t('sheet.removeFromWorkspace'), icon: Trash2, destructive: true, onSelect: () => setRemovingMember(actionMember) }]
                  : []),
              ]
            : []
        }
      />

      {/* AddMemberModal */}
      {isAddModalOpen && (
        <AddMemberModal
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={(data) => addMutation.mutate(data)}
          isSubmitting={addMutation.isPending}
        />
      )}

      {/* EditRoleModal */}
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
        title={t('removeConfirm.title')}
        message={removingMember ? t('removeConfirm.message', { email: removingMember.email }) : ''}
        isPending={removeMutation.isPending}
        onConfirm={() => removingMember && removeMutation.mutate(removingMember.user_id)}
        onCancel={() => setRemovingMember(null)}
      />

      {/* ResetPasswordModal */}
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

      {/* Reset-2FA ConfirmDialog */}
      <ConfirmDialog
        isOpen={!!resetting2FA}
        title={t('reset2faConfirm.title')}
        message={resetting2FA ? t('reset2faConfirm.message', { name: resetting2FA.full_name || resetting2FA.email }) : ''}
        confirmLabel={t('reset2faConfirm.confirm')}
        isPending={reset2FAMutation.isPending}
        onConfirm={() => resetting2FA && reset2FAMutation.mutate(resetting2FA.user_id)}
        onCancel={() => setResetting2FA(null)}
      />

      {/* ChangeMyPasswordModal */}
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
      return <Star size={12} className="text-warning" />
    case 'admin':
      return <Shield size={12} className="text-text" />
    case 'member':
      return <User size={12} className="text-text" />
    case 'viewer':
      return <Eye size={12} className="text-text-muted" />
    default:
      return <User size={12} className="text-text-muted" />
  }
}

function getRoleBadgeColor(role: string) {
  switch (role) {
    case 'owner':
      return 'bg-warning-bg text-warning'
    case 'admin':
      return 'bg-surface-hover text-text'
    case 'member':
      return 'bg-surface-hover text-text'
    case 'viewer':
      return 'bg-surface-hover text-text-muted'
    default:
      return 'bg-surface-hover text-text-muted'
  }
}

interface MemberCardProps {
  member: WorkspaceMember
  isCurrentUser: boolean
  /** Whether tapping opens the action sheet (any permitted action exists). */
  tappable: boolean
  onTap: () => void
}

/** Mobile list row (S5) - same identity/badges as the table, stacked. */
function MemberCard({ member, isCurrentUser, tappable, onTap }: MemberCardProps) {
  const { t } = useTranslation('members')
  return (
    <div
      {...(tappable ? tappableProps(onTap) : {})}
      className={`flex items-center gap-3 px-4 py-3 ${
        tappable ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
      }`}
    >
      <div className="flex-shrink-0 h-10 w-10 bg-surface-muted rounded-sm flex items-center justify-center">
        <span className="text-text-muted font-medium">{member.email?.[0]?.toUpperCase() ?? '?'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text flex items-center gap-2">
          <span className="truncate">{member.full_name || member.email}</span>
          {isCurrentUser && (
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-surface-hover text-text px-2 py-0.5 rounded-sm border border-border flex-shrink-0">
              {t('badges.you')}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-border font-mono text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeColor(member.role)}`}
          >
            {getRoleIcon(member.role)}
            {t(`roles.${member.role}`, { defaultValue: member.role })}
          </span>
          <span
            className={`inline-flex px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm border ${
              member.is_active
                ? 'bg-positive-bg text-positive border-positive/30'
                : 'bg-negative-bg text-negative border-negative/30'
            }`}
          >
            {member.is_active ? t('badges.active') : t('badges.inactive')}
          </span>
        </div>
      </div>
    </div>
  )
}

interface MemberRowProps {
  member: WorkspaceMember
  isCurrentUser: boolean
  canResetPassword: boolean
  canReset2FA: boolean
  onEditRole: () => void
  onRemove: () => void
  onResetPassword: () => void
  onReset2FA: () => void
}

function MemberRow({ member, isCurrentUser, canResetPassword, canReset2FA, onEditRole, onRemove, onResetPassword, onReset2FA }: MemberRowProps) {
  const { t } = useTranslation('members')
  const { canManageMembers, canEditMember } = usePermissions()
  const canEditThisMember = canEditMember(member)
  const showActions = canEditThisMember || canResetPassword || canReset2FA

  return (
    <tr className={isCurrentUser ? 'bg-surface-hover/50' : ''}>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="flex-shrink-0 h-10 w-10 bg-surface-muted rounded-sm flex items-center justify-center">
            <span className="text-text-muted font-medium">
              {member.email?.[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-text flex items-center gap-2">
              {member.full_name || member.email}
              {isCurrentUser && (
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-surface-hover text-text px-2 py-0.5 rounded-sm border border-border">{t('badges.you')}</span>
              )}
            </div>
            {member.full_name && (
              <div className="text-sm text-text-muted">{member.email}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-border font-mono text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeColor(member.role)}`}>
          {getRoleIcon(member.role)}
          {t(`roles.${member.role}`, { defaultValue: member.role })}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`inline-flex px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider rounded-sm border ${
          member.is_active ? 'bg-positive-bg text-positive border-positive/30' : 'bg-negative-bg text-negative border-negative/30'
        }`}>
          {member.is_active ? t('badges.active') : t('badges.inactive')}
        </span>
      </td>
      {canManageMembers && (
        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
          {showActions && (
            <div className="flex justify-end gap-2">
              {canEditThisMember && (
                <button
                  onClick={onEditRole}
                  className="p-1.5 text-text-muted hover:text-text transition-colors"
                  title={t('row.editRole')}
                >
                  <Pencil size={14} />
                </button>
              )}
              {canResetPassword && (
                <button
                  onClick={onResetPassword}
                  className="p-1.5 text-text-muted hover:text-text transition-colors"
                  title={t('row.resetPassword')}
                >
                  <KeyRound size={14} />
                </button>
              )}
              {canReset2FA && (
                <button
                  type="button"
                  onClick={onReset2FA}
                  className="p-1.5 text-text-muted hover:text-text transition-colors"
                  title={t('row.reset2fa')}
                >
                  <ShieldOff size={14} />
                </button>
              )}
              {canEditThisMember && (
                <button
                  onClick={onRemove}
                  className="p-1.5 text-text-muted hover:text-negative transition-colors"
                  title={t('row.remove')}
                >
                  <Trash2 size={14} />
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
  const { t } = useTranslation('members')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      email,
      password: password || undefined,
      role,
      full_name: fullName || undefined,
    })
  }

  return (
    <Modal open={true} onClose={onClose} size="md" className="p-6" title={t('addModal.title')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>
              {t('addModal.emailLabel')}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder={t('addModal.emailPlaceholder')}
            />
          </div>

          <div>
            <label className={labelClass}>
              {t('addModal.passwordLabel')}
            </label>
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder={t('addModal.passwordPlaceholder')}
              autoComplete="new-password"
            />
            <p className="text-xs text-text-muted mt-1">
              {t('addModal.passwordHelper')}
            </p>
          </div>

          <div>
            <label className={labelClass}>
              {t('addModal.fullNameLabel')}
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
              placeholder={t('addModal.fullNamePlaceholder')}
            />
          </div>

          <div>
            <label className={labelClass}>
              {t('addModal.roleLabel')}
            </label>
            <Select
              value={role}
              onChange={(v) => setRole(v)}
              options={[
                { value: 'viewer', label: t('addModal.roleViewer') },
                { value: 'member', label: t('addModal.roleMember') },
                { value: 'admin', label: t('addModal.roleAdmin') },
              ]}
              aria-label={t('addModal.roleAria')}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 ${secondaryButtonClass}`}
              disabled={isSubmitting}
            >
              {t('addModal.cancel')}
            </button>
            <button
              type="submit"
              className={`flex-1 ${primaryButtonClass}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? t('addModal.submitting') : t('addModal.submit')}
            </button>
          </div>
        </form>
    </Modal>
  )
}

interface EditRoleModalProps {
  member: WorkspaceMember
  onClose: () => void
  onSubmit: (role: string) => void
  isSubmitting: boolean
}

function EditRoleModal({ member, onClose, onSubmit, isSubmitting }: EditRoleModalProps) {
  const { t } = useTranslation('members')
  const [role, setRole] = useState(member.role)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(role)
  }

  return (
    <Modal open={true} onClose={onClose} size="md" className="p-6" title={t('editRoleModal.title')}>
        <p className="text-text-muted mb-4">
          {t('editRoleModal.updateFor')}{' '}
          <strong className="text-text">{member.full_name || member.email}</strong>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>
              {t('editRoleModal.roleLabel')}
            </label>
            <Select
              value={role}
              onChange={(v) => setRole(v)}
              options={[
                { value: 'viewer', label: t('addModal.roleViewer') },
                { value: 'member', label: t('addModal.roleMember') },
                { value: 'admin', label: t('addModal.roleAdmin') },
              ]}
              aria-label={t('editRoleModal.roleAria')}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 ${secondaryButtonClass}`}
              disabled={isSubmitting}
            >
              {t('editRoleModal.cancel')}
            </button>
            <button
              type="submit"
              className={`flex-1 ${primaryButtonClass}`}
              disabled={isSubmitting || role === member.role}
            >
              {isSubmitting ? t('editRoleModal.submitting') : t('editRoleModal.submit')}
            </button>
          </div>
        </form>
    </Modal>
  )
}

interface ResetPasswordModalProps {
  member: WorkspaceMember
  onClose: () => void
  onSubmit: (newPassword: string) => void
  isSubmitting: boolean
}

function ResetPasswordModal({ member, onClose, onSubmit, isSubmitting }: ResetPasswordModalProps) {
  const { t } = useTranslation('members')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError(t('resetPasswordModal.tooShort'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t('resetPasswordModal.mismatch'))
      return
    }

    onSubmit(newPassword)
  }

  return (
    <Modal open={true} onClose={onClose} size="md" className="p-6" title={t('resetPasswordModal.title')}>
        <p className="text-text-muted mb-4">
          {t('resetPasswordModal.resettingFor')}{' '}
          <strong className="text-text">{member.full_name || member.email}</strong>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>
              {t('resetPasswordModal.newPasswordLabel')}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              placeholder={t('resetPasswordModal.newPasswordPlaceholder')}
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className={labelClass}>
              {t('resetPasswordModal.confirmPasswordLabel')}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              placeholder={t('resetPasswordModal.confirmPasswordPlaceholder')}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-negative">{error}</p>
          )}

          <div className="bg-warning-bg text-warning rounded-sm p-3">
            <p className="text-sm">
              {t('resetPasswordModal.warning')}
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 ${secondaryButtonClass}`}
              disabled={isSubmitting}
            >
              {t('resetPasswordModal.cancel')}
            </button>
            <button
              type="submit"
              className={`flex-1 ${primaryButtonClass}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? t('resetPasswordModal.submitting') : t('resetPasswordModal.submit')}
            </button>
          </div>
        </form>
    </Modal>
  )
}

interface ChangeMyPasswordModalProps {
  onClose: () => void
  onSubmit: (currentPassword: string, newPassword: string) => void
  isSubmitting: boolean
}

function ChangeMyPasswordModal({ onClose, onSubmit, isSubmitting }: ChangeMyPasswordModalProps) {
  const { t } = useTranslation('members')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!currentPassword) {
      setError(t('changeMyPasswordModal.currentRequired'))
      return
    }

    if (newPassword.length < 8) {
      setError(t('changeMyPasswordModal.tooShort'))
      return
    }

    if (newPassword !== confirmPassword) {
      setError(t('changeMyPasswordModal.mismatch'))
      return
    }

    if (currentPassword === newPassword) {
      setError(t('changeMyPasswordModal.sameAsCurrent'))
      return
    }

    onSubmit(currentPassword, newPassword)
  }

  return (
    <Modal open={true} onClose={onClose} size="md" className="p-6" title={t('changeMyPasswordModal.title')}>
        <p className="text-text-muted mb-4">
          {t('changeMyPasswordModal.intro')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>
              {t('changeMyPasswordModal.currentLabel')}
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
              placeholder={t('changeMyPasswordModal.currentPlaceholder')}
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className={labelClass}>
              {t('changeMyPasswordModal.newLabel')}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              placeholder={t('changeMyPasswordModal.newPlaceholder')}
              autoComplete="new-password"
            />
            <p className="text-xs text-text-muted mt-1">
              {t('changeMyPasswordModal.minLength')}
            </p>
          </div>

          <div>
            <label className={labelClass}>
              {t('changeMyPasswordModal.confirmLabel')}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              placeholder={t('changeMyPasswordModal.confirmPlaceholder')}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <p className="text-sm text-negative">{error}</p>
          )}

          <div className="bg-surface-hover rounded-sm p-3">
            <p className="text-sm text-text">
              {t('changeMyPasswordModal.stayLoggedIn')}
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 ${secondaryButtonClass}`}
              disabled={isSubmitting}
            >
              {t('changeMyPasswordModal.cancel')}
            </button>
            <button
              type="submit"
              className={`flex-1 ${primaryButtonClass}`}
              disabled={isSubmitting}
            >
              {isSubmitting ? t('changeMyPasswordModal.submitting') : t('changeMyPasswordModal.submit')}
            </button>
          </div>
        </form>
    </Modal>
  )
}
