import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { bookmarksApi } from '../api/client'
import type { BookmarkCreateInput, BookmarkInput } from '../api/client'

// Cache key for the bookmark list. The API is workspace-scoped (rows are
// personal per workspace), so this is a workspace-scoped key: WorkspaceContext's
// switch purge removes it with the other workspace keys. It must NOT join
// userScopedQueryKeys in WorkspaceContext.tsx.

/** Query key for the user's bookmark list in the current workspace. */
export const bookmarksKey = ['bookmarks'] as const

/**
 * The user's bookmarks in the current workspace, ordered by position (the
 * manage page's order). Includes inactive AND archived rows - consumers
 * filter client-side (sidebar/More show active, non-archived, capped).
 *
 * Pass enabled: false at call sites that mount without a workspace
 * (Sidebar/BottomNav render workspace-less) - the useEnabledCurrencies
 * precedent: an ambient workspace-scoped GET with no workspace is only
 * ever rejected. The ambient hook call stays unconditional at every
 * workspace-gated site.
 */
export function useBookmarks(enabled = true) {
  return useQuery({
    queryKey: bookmarksKey,
    queryFn: () => bookmarksApi.list(),
    refetchOnWindowFocus: 'always',
    enabled,
  })
}

// Mutations own their invalidation; success/error copy lives with the
// consuming components so each surface speaks its own i18n namespace.

/** Create a bookmark; refetches the list on success. */
export function useCreateBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: BookmarkCreateInput) => bookmarksApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarksKey })
    },
  })
}

/** Edit name/icon/color (the target is immutable after create); refetches. */
export function useUpdateBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: BookmarkInput }) => bookmarksApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarksKey })
    },
  })
}

/** Toggle sidebar visibility (is_active) and/or archived state; refetches. */
export function useSetBookmarkVisibility() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; is_active?: boolean; is_archived?: boolean }) =>
      bookmarksApi.setVisibility(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarksKey })
    },
  })
}

/** Swap a bookmark with its neighbor (manage-page reorder); refetches. */
export function useMoveBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: 'up' | 'down' }) =>
      bookmarksApi.move(id, direction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarksKey })
    },
  })
}

/** Delete a bookmark permanently; refetches the list on success. */
export function useDeleteBookmark() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => bookmarksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: bookmarksKey })
    },
  })
}
