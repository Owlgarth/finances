import { useState, useRef, useEffect } from 'react'
import { Check, Plus, Settings, Landmark, ChevronDown, Loader2 } from 'lucide-react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useWorkspaceSwitch } from '../../hooks/useWorkspaceSwitch'
import { hasActiveOverlay } from '../../hooks/useOverlay'
import RoleBadge from '../common/RoleBadge'
import CreateWorkspaceForm from './CreateWorkspaceForm'

interface WorkspaceSelectorProps {
  onOpenSettings: () => void
  /** Icon-only trigger for the 56px tablet/collapsed rail; the panel widens past the rail. */
  collapsed?: boolean
}

export default function WorkspaceSelector({ onOpenSettings, collapsed = false }: WorkspaceSelectorProps) {
  const { workspace, workspaces, isLoading } = useWorkspace()
  const { switchingToId, switchTo } = useWorkspaceSwitch()
  const [isOpen, setIsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      // Yield Escape while a Modal/BottomSheet is open — the overlay stack
      // owns the key then (topmost-only close).
      if (event.key === 'Escape' && !hasActiveOverlay()) {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      {collapsed ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          title={workspace ? workspace.name : 'No workspace'}
          aria-label={workspace ? `Workspace: ${workspace.name}` : 'No workspace'}
          className="flex items-center justify-center w-full py-2 min-h-[44px] rounded-sm text-text-muted hover:bg-surface-hover hover:text-text transition-colors disabled:opacity-50"
        >
          <Landmark size={14} className="flex-shrink-0" />
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-sm border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <Landmark size={14} className="flex-shrink-0 text-text-muted" />
          <span className="text-sm font-medium text-text truncate flex-1 text-left">
            {workspace ? workspace.name : 'No workspace'}
          </span>
          <ChevronDown size={14} className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      )}

      {isOpen && (
        <div
          className={`absolute top-full mt-1 bg-surface border border-border rounded-sm z-dropdown max-h-80 overflow-y-auto ${
            collapsed ? 'left-0 w-64' : 'left-0 right-0'
          }`}
        >
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => switchTo(ws, () => setIsOpen(false))}
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
              <RoleBadge role={ws.user_role} />
            </button>
          ))}

          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={() => {
                setIsOpen(false)
                setCreateOpen(true)
              }}
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
        </div>
      )}

      <CreateWorkspaceForm open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
