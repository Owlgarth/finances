import { useState, useEffect } from 'react'
import { Trash2, TriangleAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../utils/errors'
import Modal from '../common/Modal'

interface WorkspaceSettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function WorkspaceSettingsPanel({ isOpen, onClose }: WorkspaceSettingsPanelProps) {
  const { workspace, deleteWorkspace, updateWorkspace, userRole } = useWorkspace()
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
      toast.success('Workspace name updated')
      onClose()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update workspace name'))
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
      toast.success(`"${deletedName}" deleted`)
      setShowDeleteConfirm(false)
      onClose()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to delete workspace'))
    } finally {
      setIsDeleting(false)
    }
  }

  if (!workspace) return null

  return (
    <Modal open={isOpen} onClose={onClose} title="Workspace Settings" className="p-6">
      <div className="space-y-6">
              <div>
                <label htmlFor="workspace-name" className="block text-sm font-medium text-text mb-1">
                  Workspace Name
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
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
                {!canEditName && (
                  <p className="mt-1 text-xs text-text-muted">Only workspace owners and admins can change the name.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1">Your Role</label>
                <div className="px-3 py-2 bg-surface-hover rounded-none">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-surface-muted text-text-muted">
                    {userRole || 'unknown'}
                  </span>
                </div>
              </div>

              {isOwner && (
                <div className="border-t border-border pt-6">
                  <h4 className="text-sm font-medium text-text mb-2">Danger Zone</h4>

                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-sm border border-negative/30 text-negative hover:bg-negative-bg transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete Workspace
                    </button>
                  ) : (
                    <div className="bg-negative-bg border border-negative/30 rounded-sm p-4">
                      <div className="flex items-start gap-3">
                        <TriangleAlert size={16} className="text-negative flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-negative font-medium">
                            Delete &quot;{workspace?.name}&quot;?
                          </p>
                          <p className="text-sm text-negative mt-1">
                            This will permanently delete all data in this workspace, including all transactions, categories, and budget periods. This action cannot be undone.
                          </p>

                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={handleDelete}
                              disabled={isDeleting}
                              className="px-3 py-1.5 border border-negative/30 text-negative text-xs font-medium rounded-sm hover:bg-negative-bg transition-colors disabled:opacity-50"
                            >
                              {isDeleting ? 'Deleting...' : 'Yes, delete'}
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(false)}
                              disabled={isDeleting}
                              className="px-3 py-1.5 bg-surface border border-border text-text text-xs font-medium rounded-sm hover:bg-surface-hover transition-colors"
                            >
                              Cancel
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
