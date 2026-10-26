import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Archive, ArchiveRestore, Bookmark as BookmarkIcon, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { authApi } from '../api/client'
import type { Bookmark } from '../types'
import { useBookmarks, useDeleteBookmark, useMoveBookmark, useSetBookmarkVisibility } from '../hooks/useBookmarks'
import { BookmarkGlyph } from '../components/bookmarks/bookmarkMeta'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import { countActiveFilters } from '../utils/bookmarks'
import { getApiErrorMessage } from '../utils/errors'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import Select from '../components/common/Select'
import Switch from '../components/common/Switch'
import { SkeletonRows } from '../components/common/Skeleton'
import BookmarkFormModal from '../components/modals/bookmarks/BookmarkFormModal'

// The sidebar-cap values the preference accepts (0 = All). Typed as plain
// numbers, not `as const`: the trigger's value is the raw stored preference
// (a number), and Select infers its value type from value AND options.
const CAP_VALUES: number[] = [3, 5, 8, 0]

// Adjacent icon buttons: pointer-coarse 44px floors with a negative vertical
// margin so the row height stays put while the neighbors stay flush. NOT
// .touch-hit - its expanded absolute hit area would overlap the neighboring
// chevron buttons.
const chevronButtonClass =
  'flex items-center justify-center p-1.5 rounded-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 ' +
  'text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'

// Pointer-fine-only hover actions - never rendered on touch, so no coarse
// floors are needed. Delete is the destructive outlier; archive/restore are
// reversible, so they stay neutral.
const hoverActionButtonClass =
  'text-text-muted hover:text-text p-1 rounded-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'
const hoverDeleteButtonClass =
  'text-text-muted hover:text-negative hover:bg-negative-bg p-1 rounded-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'

export default function BookmarksPage() {
  const { t } = useTranslation('bookmarks')
  const queryClient = useQueryClient()
  const { bookmarkVisibleLimit } = useUserPreferences()
  const isTouch = useIsTouch()

  const { data: bookmarks = [], isLoading } = useBookmarks()
  // The main list is every NON-archived row regardless of is_active: the
  // Switch is that flag's editor (is_active only governs sidebar/More
  // visibility). Archived rows live only in the section below.
  const activeBookmarks = bookmarks.filter((b) => !b.is_archived)
  const archivedBookmarks = bookmarks.filter((b) => b.is_archived)

  const moveMutation = useMoveBookmark()
  const visibilityMutation = useSetBookmarkVisibility()
  const deleteMutation = useDeleteBookmark()

  const [editing, setEditing] = useState<Bookmark | null>(null)
  const [deleting, setDeleting] = useState<Bookmark | null>(null)
  // Touch replacement for both hover action groups. The row's own
  // is_archived picks the sheet's action list, so one state serves both
  // sections.
  const [rowAction, setRowAction] = useState<Bookmark | null>(null)

  const capMutation = useMutation({
    mutationFn: (value: number) => authApi.updatePreferences({ bookmark_visible_limit: value }),
    onSuccess: () => {
      // The sidebar and More sheet read the cap through
      // UserPreferencesContext, which observes this query - the refetch is
      // the whole wiring (ProfilePage's preferences-mutation pattern).
      // Quiet success by design: the Select snapping IS the feedback.
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('capSaveFailed'))),
  })
  // Instant feel without cache surgery: the PATCH response drives the
  // trigger until the invalidation refetch lands; a failure leaves it
  // undefined so the stored preference shows again.
  const cap = capMutation.data?.bookmark_visible_limit ?? bookmarkVisibleLimit
  const capOptions = CAP_VALUES.map((v) => ({ value: v, label: v === 0 ? t('capAll') : String(v) }))

  // Moves and the Switch are quiet on success (the refetched list / switch
  // position are the feedback); every error toasts with the server's own
  // message preferred over the translated fallback.
  const onQuietError = (error: unknown) => toast.error(getApiErrorMessage(error, t('updateFailed')))

  const move = (b: Bookmark, direction: 'up' | 'down') =>
    moveMutation.mutate({ id: b.id, direction }, { onError: onQuietError })

  const setVisible = (b: Bookmark, is_active: boolean) =>
    visibilityMutation.mutate({ id: b.id, is_active }, { onError: onQuietError })

  const archive = (b: Bookmark) =>
    visibilityMutation.mutate(
      { id: b.id, is_archived: true },
      {
        onSuccess: () => toast.success(t('archived')),
        onError: onQuietError,
      },
    )

  const restore = (b: Bookmark) =>
    visibilityMutation.mutate(
      { id: b.id, is_archived: false },
      {
        onSuccess: () => toast.success(t('restored')),
        onError: onQuietError,
      },
    )

  // Mono 10px row summary: budget -> "Budget - EUR"; page bookmarks ->
  // "Transactions - 2 filters" / "Transactions - no filters". The middot
  // separator is a code literal (the list pages' meta-line pattern). The
  // shared countActiveFilters helper also skips empty-string values, so the
  // count always agrees with the create/edit modal's summary of the same
  // bookmark.
  const targetSummary = (b: Bookmark): string => {
    if (b.kind === 'budget') return `${b.budget_name} · ${b.currency_code}`
    const pageName = b.kind === 'transactions' ? t('pageName.transactions') : t('pageName.planned')
    const count = countActiveFilters(b.params)
    return count === 0 ? `${pageName} · ${t('noFilters')}` : `${pageName} · ${count} ${t('filtersLabel', { count })}`
  }

  // Move-at-ends state for the sheet's disabled rows (the chevron buttons
  // read their own map index directly).
  const actionIndex = rowAction ? activeBookmarks.findIndex((b) => b.id === rowAction.id) : -1

  return (
    <div className="p-6 max-sm:p-0 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        {/* text-base (the 16px page-title cap), not the older pages' text-lg. */}
        <h1 className="text-base font-semibold text-text">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{t('showInSidebar')}</span>
          <Select
            value={cap}
            onChange={(v) => capMutation.mutate(v)}
            options={capOptions}
            mono
            className="w-24"
            aria-label={t('showInSidebar')}
          />
        </div>
      </div>

      {isLoading ? (
        <SkeletonRows count={4} rowClassName="h-12 w-full" />
      ) : bookmarks.length === 0 ? (
        <EmptyState
          icon={<BookmarkIcon size={48} strokeWidth={1.5} className="text-text-muted/30" />}
          heading={t('emptyTitle')}
          message={t('emptyMessage')}
        />
      ) : (
        <>
          {activeBookmarks.length > 0 && (
            <div className="border border-border rounded-sm bg-surface divide-y divide-border">
              {activeBookmarks.map((b, index) => (
                <div
                  key={b.id}
                  {...(isTouch ? tappableProps(() => setRowAction(b)) : {})}
                  className={`flex items-center gap-3 px-4 py-3 text-sm group ${
                    isTouch ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
                  }`}
                >
                  {/* Leading tile: the colored glyph IS the color affordance (no extra dot). */}
                  <div className="h-6 w-6 border border-border rounded-none bg-surface flex items-center justify-center flex-shrink-0">
                    <BookmarkGlyph bookmark={b} size={12} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-text truncate">{b.name}</div>
                    <div className="text-[10px] font-mono text-text-muted truncate">{targetSummary(b)}</div>
                  </div>
                  {/* Always-visible controls; chevrons disabled at list ends.
                      The wrapper swallows click/keydown so acting on a
                      chevron or the Switch never ALSO opens the row's touch
                      action sheet (events would bubble into the tappable
                      row handlers). */}
                  <div
                    className="flex items-center gap-1 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => move(b, 'up')}
                      disabled={index === 0}
                      title={t('moveUpAria', { name: b.name })}
                      aria-label={t('moveUpAria', { name: b.name })}
                      className={chevronButtonClass}
                    >
                      <ChevronUp size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(b, 'down')}
                      disabled={index === activeBookmarks.length - 1}
                      title={t('moveDownAria', { name: b.name })}
                      aria-label={t('moveDownAria', { name: b.name })}
                      className={chevronButtonClass}
                    >
                      <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <Switch
                      checked={b.is_active}
                      onChange={(checked) => setVisible(b, checked)}
                      aria-label={t('showAria', { name: b.name })}
                    />
                  </div>
                  {/* Hover reveals are pointer-fine only - on touch the row tap
                      opens the action sheet instead. */}
                  {!isTouch && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setEditing(b)}
                        title={t('editAria', { name: b.name })}
                        aria-label={t('editAria', { name: b.name })}
                        className={hoverActionButtonClass}
                      >
                        <Pencil size={14} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => archive(b)}
                        title={t('archiveAria', { name: b.name })}
                        aria-label={t('archiveAria', { name: b.name })}
                        className={hoverActionButtonClass}
                      >
                        <Archive size={14} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(b)}
                        title={t('deleteAria', { name: b.name })}
                        aria-label={t('deleteAria', { name: b.name })}
                        className={hoverDeleteButtonClass}
                      >
                        <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {archivedBookmarks.length > 0 && (
            <div className={activeBookmarks.length > 0 ? 'mt-8' : ''}>
              <h2 className="text-sm font-medium text-text mb-2">{t('archivedSection')}</h2>
              <div className="border border-border rounded-sm bg-surface divide-y divide-border">
                {archivedBookmarks.map((b) => (
                  <div
                    key={b.id}
                    {...(isTouch ? tappableProps(() => setRowAction(b)) : {})}
                    className={`flex items-center gap-3 px-4 py-3 text-sm group ${
                      isTouch ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
                    }`}
                  >
                    <div className="h-6 w-6 border border-border rounded-none bg-surface flex items-center justify-center flex-shrink-0">
                      <BookmarkGlyph bookmark={b} size={12} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-text truncate">{b.name}</div>
                      <div className="text-[10px] font-mono text-text-muted truncate">{targetSummary(b)}</div>
                    </div>
                    {/* Same anatomy minus Switch and chevrons: restore is
                        reversible, so it stays non-destructive. */}
                    {!isTouch && (
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => restore(b)}
                          title={t('restoreAria', { name: b.name })}
                          aria-label={t('restoreAria', { name: b.name })}
                          className={hoverActionButtonClass}
                        >
                          <ArchiveRestore size={14} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(b)}
                          title={t('editAria', { name: b.name })}
                          aria-label={t('editAria', { name: b.name })}
                          className={hoverActionButtonClass}
                        >
                          <Pencil size={14} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(b)}
                          title={t('deleteAria', { name: b.name })}
                          aria-label={t('deleteAria', { name: b.name })}
                          className={hoverDeleteButtonClass}
                        >
                          <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit: mount-per-use (the modal's contract - the conditional render
          IS the open/close). key forces a remount if the edit target ever
          swaps while mounted; no nonce needed otherwise (the null gap
          between two opens always unmounts first). */}
      {editing && (
        <BookmarkFormModal
          key={editing.id}
          bookmark={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {/* Destructive confirm with nothing to correct: closes on BOTH success
          and error; isPending gates double-fire. */}
      <ConfirmDialog
        isOpen={!!deleting}
        title={t('deleteTitle')}
        message={t('deleteMessage', { name: deleting?.name })}
        isPending={deleteMutation.isPending}
        onConfirm={() =>
          deleting &&
          deleteMutation.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('deleted'))
              setDeleting(null)
            },
            onError: (error) => {
              toast.error(getApiErrorMessage(error, t('deleteFailed')))
              setDeleting(null)
            },
          })
        }
        onCancel={() => setDeleting(null)}
      />

      {/* Touch replacement for both hover groups; the sheet closes before
          running an action, so edit/delete chain into modal/dialog safely.
          The row's own is_archived picks the action list. */}
      <ActionSheet
        open={!!rowAction}
        onClose={() => setRowAction(null)}
        title={rowAction?.name}
        actions={
          rowAction && rowAction.is_archived
            ? [
                { label: t('restoreAria', { name: rowAction.name }), icon: ArchiveRestore, onSelect: () => restore(rowAction) },
                { label: t('editAria', { name: rowAction.name }), icon: Pencil, onSelect: () => setEditing(rowAction) },
                { label: t('deleteAria', { name: rowAction.name }), icon: Trash2, destructive: true, onSelect: () => setDeleting(rowAction) },
              ]
            : rowAction
              ? [
                  { label: t('moveUp'), icon: ChevronUp, disabled: actionIndex === 0, onSelect: () => move(rowAction, 'up') },
                  { label: t('moveDown'), icon: ChevronDown, disabled: actionIndex === activeBookmarks.length - 1, onSelect: () => move(rowAction, 'down') },
                  { label: t('editAria', { name: rowAction.name }), icon: Pencil, onSelect: () => setEditing(rowAction) },
                  { label: t('archiveAria', { name: rowAction.name }), icon: Archive, onSelect: () => archive(rowAction) },
                  { label: t('deleteAria', { name: rowAction.name }), icon: Trash2, destructive: true, onSelect: () => setDeleting(rowAction) },
                ]
              : []
        }
      />
    </div>
  )
}
