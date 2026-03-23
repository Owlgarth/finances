import { useState, useEffect } from 'react'
import { HiTrash, HiExclamationTriangle } from 'react-icons/hi2'
import { HiX } from 'react-icons/hi'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../../utils/errors'

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

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

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

  if (!isOpen || !workspace) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="ws-settings-title">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} aria-hidden="true" />

        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 id="ws-settings-title" className="text-lg font-semibold text-gray-900">Workspace Settings</h3>
              <button
                onClick={onClose}
                autoFocus
                aria-label="Close settings"
                className="rounded-md text-gray-400 hover:text-gray-500"
              >
                <HiX className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="flex-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed px-3 py-2 border"
                  />
                  {canEditName && (
                    <button
                      onClick={handleSaveName}
                      disabled={isSaving || !newName.trim() || newName === workspace?.name}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
                {!canEditName && (
                  <p className="mt-1 text-xs text-gray-500">Only workspace owners and admins can change the name.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Role</label>
                <div className="px-3 py-2 bg-gray-50 rounded-md">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    userRole === 'owner' ? 'bg-purple-100 text-purple-800' :
                    userRole === 'admin' ? 'bg-blue-100 text-blue-800' :
                    userRole === 'member' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {userRole || 'unknown'}
                  </span>
                </div>
              </div>

              {isOwner && (
                <div className="border-t border-gray-200 pt-6">
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Danger Zone</h4>

                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-red-700 bg-red-50 hover:bg-red-100"
                    >
                      <HiTrash className="h-4 w-4" />
                      Delete Workspace
                    </button>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <HiExclamationTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-red-800 font-medium">
                            Delete &quot;{workspace?.name}&quot;?
                          </p>
                          <p className="text-sm text-red-700 mt-1">
                            This will permanently delete all data in this workspace, including all transactions, categories, and budget periods. This action cannot be undone.
                          </p>

                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={handleDelete}
                              disabled={isDeleting}
                              className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50"
                            >
                              {isDeleting ? 'Deleting...' : 'Yes, delete'}
                            </button>
                            <button
                              onClick={() => setShowDeleteConfirm(false)}
                              disabled={isDeleting}
                              className="px-3 py-1.5 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50"
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
          </div>
        </div>
      </div>
    </div>
  )
}
