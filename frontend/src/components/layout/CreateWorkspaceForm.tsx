import { useState } from 'react'
import { HiPlus } from 'react-icons/hi'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../../utils/errors'

interface CreateWorkspaceFormProps {
  onCancel: () => void
  onCreated?: () => void
  compact?: boolean
}

export default function CreateWorkspaceForm({ onCancel, onCreated, compact = false }: CreateWorkspaceFormProps) {
  const { createWorkspace } = useWorkspace()
  const [name, setName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setIsSubmitting(true)
    try {
      await createWorkspace(name.trim())
      toast.success('Workspace created')
      setName('')
      onCreated?.()
      onCancel()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to create workspace'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }

  if (compact) {
    return (
      <div className="p-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workspace name"
          maxLength={100}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
          onKeyDown={handleKeyDown}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isSubmitting}
            className="flex-1 px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Workspace name"
        className="block w-64 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={isSubmitting || !name.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function CreateWorkspaceButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
    >
      <HiPlus className="h-4 w-4" />
      Create Workspace
    </button>
  )
}

export { CreateWorkspaceButton }
