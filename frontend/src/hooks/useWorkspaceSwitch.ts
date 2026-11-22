import { useState } from 'react'
import toast from 'react-hot-toast'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useAuth } from '../contexts/AuthContext'
import { removeFormDraft } from '../utils/formDraft'
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
  const { user } = useAuth()
  const [switchingToId, setSwitchingToId] = useState<number | null>(null)

  const switchTo = async (ws: Workspace, onDone?: () => void) => {
    if (ws.id === workspace?.id) {
      onDone?.()
      return
    }
    setSwitchingToId(ws.id)
    try {
      await switchWorkspace(ws.id)
      // The old workspace's /new draft does not follow the user into the
      // new workspace; cleared only on a SUCCESSFUL switch (a failed one
      // leaves the user where they were, draft included). `workspace` is
      // the click-render's closure value - the old workspace by
      // construction. The generation bump inside also aborts any pending
      // /new controller flush.
      if (user && workspace) removeFormDraft(user.id, workspace.id)
      onDone?.()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to switch workspace'))
    } finally {
      setSwitchingToId(null)
    }
  }

  return { switchingToId, switchTo }
}
