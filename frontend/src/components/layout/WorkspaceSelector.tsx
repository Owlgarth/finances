import { useState, useRef, useEffect } from 'react'
import { Check, Plus, Settings, Landmark, ChevronDown, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../utils/errors'
import CreateWorkspaceForm from './CreateWorkspaceForm'
import type { Workspace } from '../../types'

interface WorkspaceSelectorProps {
  onOpenSettings: () => void
}

export default function WorkspaceSelector({ onOpenSettings }: WorkspaceSelectorProps) {
  const { workspace, workspaces, switchWorkspace, isLoading } = useWorkspace()
  const [isOpen, setIsOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [switchingToId, setSwitchingToId] = useState<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsCreating(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setIsCreating(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  const handleSwitch = async (ws: Workspace) => {
    if (ws.id === workspace?.id) {
      setIsOpen(false)
      return
    }
    setSwitchingToId(ws.id)
    try {
      await switchWorkspace(ws.id)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to switch workspace:', error)
      toast.error(getApiErrorMessage(error, 'Failed to switch workspace'))
    } finally {
      setSwitchingToId(null)
    }
  }

  const getRoleBadge = (ws: Workspace) => {
    const role = ws.user_role
    if (!role) return null
    return (
      <span className="text-xs px-1.5 py-0.5 rounded-sm bg-surface-muted text-text-muted">
        {role}
      </span>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-sm border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50"
      >
        <Landmark size={14} className={`flex-shrink-0 ${workspace ? 'text-text-muted' : 'text-text-muted'}`} />
        <span className="text-sm font-medium text-text truncate flex-1 text-left">
          {workspace ? workspace.name : 'No workspace'}
        </span>
        <ChevronDown size={14} className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-sm z-dropdown max-h-80 overflow-y-auto">
          {isCreating ? (
            <CreateWorkspaceForm
              compact
              onCancel={() => setIsCreating(false)}
              onCreated={() => setIsOpen(false)}
            />
          ) : (
            <>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => handleSwitch(ws)}
                  disabled={switchingToId !== null}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-surface-hover transition-colors ${
                    ws.id === workspace?.id ? 'bg-surface-hover' : ''
                  }`}
                >
                  {ws.id === workspace?.id ? (
                    <Check size={14} className="text-text flex-shrink-0" />
                  ) : switchingToId === ws.id ? (
                    <Loader2 size={14} className="animate-spin text-text flex-shrink-0" />
                  ) : (
                    <div className="h-4 w-4" />
                  )}
                  <span className="truncate flex-1 text-left text-text">{ws.name}</span>
                  {getRoleBadge(ws)}
                </button>
              ))}

              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-muted hover:bg-surface-hover transition-colors"
                >
                  <Plus size={14} />
                  Create workspace
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false)
                    onOpenSettings()
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-muted hover:bg-surface-hover transition-colors"
                >
                  <Settings size={14} />
                  Workspace settings
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
