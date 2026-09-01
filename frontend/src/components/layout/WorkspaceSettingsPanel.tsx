import { useState, useEffect } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { usePermissions } from '../../hooks/usePermissions'
import { getApiErrorMessage } from '../../utils/errors'
import Modal from '../common/Modal'
import CurrenciesSettingsSection from '../currencies/CurrenciesSettingsSection'

interface WorkspaceSettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function WorkspaceSettingsPanel({ isOpen, onClose }: WorkspaceSettingsPanelProps) {
  const { t } = useTranslation('settings')
  const { workspace, deleteWorkspace, updateWorkspace, userRole } = useWorkspace()
  const { canManageCurrencies } = usePermissions()
  const [newName, setNewName] = useState(workspace?.name || '')
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    setNewName(workspace?.name || '')
  }, [workspace?.id, workspace?.name])

  useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false)
    }
  }, [isOpen])

  const isOwner = userRole === 'owner'
  const canEditName = userRole === 'owner' || userRole === 'admin'
  const canDelete = isOwner

  const handleSaveName = async () => {
    if (!newName.trim() || newName === workspace?.name) return
    setIsSaving(true)
    try {
      await updateWorkspace({ name: newName.trim() })
      toast.success(t('workspaceSettings.nameUpdated'))
      onClose()
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('workspaceSettings.nameUpdateFailed')))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!workspace || !canDelete) return
    const deletedName = workspace.name
    setIsDeleting(true)
    try {
      await deleteWorkspace(workspace.id)
      toast.success(t('workspaceSettings.deleted', { name: deletedName }))
      setShowDeleteConfirm(false)
      onClose()
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('workspaceSettings.deleteFailed')))
    } finally {
      setIsDeleting(false)
    }
  }

  if (!workspace) return null

  return (
    <Modal open={isOpen} onClose={onClose} title={t('workspaceSettings.title')} className="p-6 max-h-[85vh] overflow-y-auto">
      <div className="space-y-6">
              <div>
                <label htmlFor="workspace-name" className="block text-sm font-medium text-text mb-1">
                  {t('workspaceSettings.nameLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="workspace-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={!canEditName}
                    maxLength={100}
                    className="flex-1 block w-full rounded-none border border-border px-3 py-2 text-sm disabled:bg-surface-muted disabled:cursor-not-allowed"
                  />
                  {canEditName && (
                    <button
                      onClick={handleSaveName}
                      disabled={isSaving || !newName.trim() || newName === workspace?.name}
                      className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? t('workspaceSettings.saving') : t('workspaceSettings.save')}
                    </button>
                  )}
                </div>
                {!canEditName && (
                  <p className="mt-1 text-xs text-text-muted">{t('workspaceSettings.namePermissionNote')}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">{t('workspaceSettings.roleLabel')}</label>
                <div className="px-3 py-2 bg-surface-hover rounded-none">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-surface-muted text-text-muted">
                    {/* roles.* lives in the members namespace (owned by the
                        members area); the raw role value is the fallback so an
                        unknown role still renders. Comparisons on userRole stay
                        raw enum values. */}
                    {userRole
                      ? t(`roles.${userRole}`, { ns: 'members', defaultValue: userRole })
                      : t('workspaceSettings.roleUnknown')}
                  </span>
                </div>
              </div>

              {canManageCurrencies && <CurrenciesSettingsSection />}

              {isOwner && (
                <div className="border-t border-border pt-6">
                  <h4 className="text-sm font-medium text-text mb-2">{t('workspaceSettings.dangerZone')}</h4>

                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-sm border border-negative/30 text-negative hover:bg-negative-bg transition-colors"
                    >
                      <Trash2 size={14} />
                      {t('workspaceSettings.deleteWorkspace')}
                    </button>
                  ) : (
                    <div className="bg-negative-bg border border-negative/30 rounded-sm p-4">
                      <div className="flex items-start gap-3">
                        <TriangleAlert size={16} className="text-negative flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-negative font-medium">
                            {t('workspaceSettings.deleteConfirmTitle', { name: workspace?.name })}
                          </p>
                          <p className="text-sm text-negative mt-1">
                            {t('workspaceSettings.deleteConfirmBody')}
                          </p>

                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={handleDelete}
                              disabled={isDeleting}
                              className="px-3 py-1.5 border border-negative/30 text-negative text-xs font-medium rounded-sm hover:bg-negative-bg transition-colors disabled:opacity-50"
                            >
                              {isDeleting ? t('workspaceSettings.deleting') : t('workspaceSettings.confirmDelete')}
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(false)}
                              disabled={isDeleting}
                              className="px-3 py-1.5 bg-surface border border-border text-text text-xs font-medium rounded-sm hover:bg-surface-hover transition-colors"
                            >
                              {t('workspaceSettings.cancel')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
      </div>
    </Modal>
  )
}
