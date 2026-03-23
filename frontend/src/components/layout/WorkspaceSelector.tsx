import { useState, useRef, useEffect } from 'react'
import { HiCheck, HiPlus, HiCog, HiOfficeBuilding } from 'react-icons/hi'
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
    const colors: Record<string, string> = {
      owner: 'bg-purple-100 text-purple-700',
      admin: 'bg-blue-100 text-blue-700',
      member: 'bg-green-100 text-green-700',
      viewer: 'bg-gray-100 text-gray-700',
    }
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded ${colors[role] || colors.viewer}`}>
        {role}
      </span>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        <HiOfficeBuilding className={`h-4 w-4 flex-shrink-0 ${workspace ? 'text-gray-600' : 'text-gray-400'}`} />
        <span className="text-sm font-medium text-gray-700 truncate flex-1 text-left">
          {workspace ? workspace.name : 'No workspace'}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
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
                  className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                    ws.id === workspace?.id ? 'bg-gray-50' : ''
                  }`}
                >
                  {ws.id === workspace?.id ? (
                    <HiCheck className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  ) : switchingToId === ws.id ? (
                    <svg className="animate-spin h-4 w-4 text-blue-600 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <div className="h-4 w-4" />
                  )}
                  <span className="truncate flex-1 text-left">{ws.name}</span>
                  {getRoleBadge(ws)}
                </button>
              ))}

              <div className="border-t border-gray-100 mt-1 pt-1">
                <button
                  onClick={() => setIsCreating(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <HiPlus className="h-4 w-4" />
                  Create workspace
                </button>
                <button
                  onClick={() => {
                    setIsOpen(false)
                    onOpenSettings()
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <HiCog className="h-4 w-4" />
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
