import { useState } from 'react'
import { Plus } from 'lucide-react'
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
          className="w-full px-2 py-1.5 text-sm border border-border rounded-none focus:outline-none"
          autoFocus
          onKeyDown={handleKeyDown}
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isSubmitting}
            className="flex-1 px-2 py-1 text-xs font-medium bg-primary text-white rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-2 py-1 text-xs font-medium border border-border rounded-sm hover:bg-surface-hover transition-colors"
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
        className="block w-64 rounded-none border border-border px-3 py-2 text-sm"
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={isSubmitting || !name.trim()}
          className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-3 py-1.5 bg-surface border border-border text-text text-xs font-medium rounded-sm hover:bg-surface-hover transition-colors"
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
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-sm hover:bg-primary-hover transition-colors"
    >
      <Plus size={14} />
      Create Workspace
    </button>
  )
}

export { CreateWorkspaceButton }
