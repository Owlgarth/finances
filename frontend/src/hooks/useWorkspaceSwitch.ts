import { useState } from 'react'
import toast from 'react-hot-toast'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../utils/errors'
import type { Workspace } from '../types'

/**
 * Shared workspace-switch handler for the two switcher surfaces (sidebar
 * WorkspaceSelector dropdown + mobile BottomNav More sheet). `switchTo` runs
 * `onDone` (close the host surface) on a same-workspace tap and on success;
 * on failure the surface stays open and a single unified toast reports the
 * error — no console.error, the toast is the signal.
 */
export function useWorkspaceSwitch() {
  const { workspace, switchWorkspace } = useWorkspace()
  const [switchingToId, setSwitchingToId] = useState<number | null>(null)

  const switchTo = async (ws: Workspace, onDone?: () => void) => {
    if (ws.id === workspace?.id) {
      onDone?.()
      return
    }
    setSwitchingToId(ws.id)
    try {
      await switchWorkspace(ws.id)
      onDone?.()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to switch workspace'))
    } finally {
      setSwitchingToId(null)
    }
  }

  return { switchingToId, switchTo }
}
