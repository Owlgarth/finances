import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workspaceSettingsApi } from '../api/client'
import type { WorkspaceSettingsPatch } from '../api/client'

// Cache key for the user's per-workspace page defaults. Workspace-scoped
// (rows are personal per workspace): WorkspaceContext's switch purge removes
// it with the other workspace keys, so the switched-into workspace refetches
// its own defaults. It must NOT join userScopedQueryKeys in
// WorkspaceContext.tsx.

/** Query key for the user's page-defaults blob in the current workspace. */
export const workspaceSettingsKey = ['workspace-settings'] as const

/**
 * The user's per-workspace page defaults. No `enabled` param - every caller
 * is a workspace-gated page (the useBookmarks workspace-less sites,
 * Sidebar/BottomNav, read no page defaults), matching the unconditional
 * ambient page queries (useAccounts precedent). `data === undefined`
 * (loading or errored) is a normal state, not an error surface: consumers
 * resolve every facet to the page built-ins through utils/pageDefaults.ts.
 * staleTime mirrors UserPreferencesContext (5 min); refetchOnWindowFocus
 * keeps the app default (stale-only) - the blob feeds no dropdown, and
 * pages read it once per mount.
 */
export function useWorkspaceSettings() {
  return useQuery({
    queryKey: workspaceSettingsKey,
    queryFn: () => workspaceSettingsApi.get(),
    staleTime: 5 * 60 * 1000,
  })
}

// Mutations own their invalidation; success/error copy lives with the
// consuming components (settings panel).

/** Persist changed page defaults (send only changed page keys); refetches
    the blob on success. */
export function useUpdateWorkspaceSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: WorkspaceSettingsPatch) => workspaceSettingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceSettingsKey })
    },
  })
}
