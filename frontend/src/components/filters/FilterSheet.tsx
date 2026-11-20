import type { ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, BookmarkPlus, Save, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BottomSheet from '../common/BottomSheet'
import SingleChoiceEditor from './SingleChoiceEditor'
import { primaryButtonClass } from '../common/formStyles'
import type { FilterDef } from '../../utils/listFilters'
import type { ParamPatch } from '../../utils/params'

/** Hub row for Sort (SingleChoiceEditor host). Absent on pages with no
 *  ordering param (Transfers). */
export interface FilterSheetSort {
  /** Effective ordering, defaulting to the page's default when unset. */
  value: string
  options: { value: string; label: string }[]
  /** The page's ordering write (maps the default value to a null param). */
  onChange: (v: string) => void
}

/** Bookmark action; absent on pages with no bookmark kind (Transfers). */
export interface FilterSheetBookmark {
  label: string
  ariaLabel: string
  /** Page handler: closes the sheet FIRST, then opens the bookmark modal,
   *  so the two overlays never stack. */
  onOpen: () => void
}

interface FilterSheetProps<V, L> {
  open: boolean
  onClose: () => void
  /** The page's registry build - the builder applies the facet conditions,
   *  and unavailable defs get no hub row (they cannot bind anything here). */
  filters: FilterDef<V, L>[]
  /** The page's EFFECTIVE facet values - the same object the badge reads,
   *  so hub-row and badge state agree by construction. */
  values: V
  /** Lookups passed straight through to isActive/summarize. */
  lookups: L
  /** Resolves registry labelKeys through the page's own namespace helper
   *  (plain keys live in page namespaces, cross-page ones 'ns:'-qualified). */
  filterLabel: (key: string) => string
  /** The page's URL-param updater - per-row clear writes go through it. */
  updateParams: (patch: ParamPatch) => void
  /** Page wires each def to its editor body with options + updateParams:
   *  each def's editor needs page-derived option lists, which the sheet
   *  must not know about. */
  renderEditor: (def: FilterDef<V, L>) => ReactNode
  sort?: FilterSheetSort
  onSaveDefaults: () => void
  saveDefaultsPending: boolean
  saveDefaultsLabel: string
  saveDefaultsPendingLabel: string
  bookmark?: FilterSheetBookmark
  /** List query total for the footer (previous total while refetching -
   *  intended; the count settles with the response). */
  total: number
  /** Footer noun, pluralized page-side: t('sheetNoun', { count: total }) -
   *  the numeral itself renders separately in font-mono. */
  footerNoun: string
}

/** Pseudo-row id for the Sort editor level. */
const SORT_ID = '__sort__'

/**
 * Two-level phone filter sheet: a hub of filter rows (label + summary +
 * per-row clear) and a one-filter editor level behind each row. The page
 * owns every piece of state (open flag, URL params, queries); the sheet is
 * a presentational composition over BottomSheet. Shared filter chrome
 * self-translates through the transactions namespace (the established
 * cross-page filter home); page-specific strings arrive as props.
 *
 * Escape steps exactly one level per press: the editor level consumes it at
 * its own container (the back button autofocuses on entry, so focus - and
 * with it the event path - sits inside the container), while hub-level
 * Escape passes through to the sheet container's own listener, closing the
 * sheet. A scrim tap closes the whole sheet from either level - the scrim
 * is the container's dismiss gesture, not a level stepper.
 */
export default function FilterSheet<V, L>({
  open,
  onClose,
  filters,
  values,
  lookups,
  filterLabel,
  updateParams,
  renderEditor,
  sort,
  onSaveDefaults,
  saveDefaultsPending,
  saveDefaultsLabel,
  saveDefaultsPendingLabel,
  bookmark,
  total,
  footerNoun,
}: FilterSheetProps<V, L>) {
  // Shared filter strings live in the transactions namespace (the
  // established cross-page home); page-specific strings arrive as props.
  const { t } = useTranslation('transactions')
  const { t: tCommon } = useTranslation('common')
  // Resolved in the body, not inside the JSX: the literal-string lint only
  // recognizes the unaliased t() callee, in attributes and children alike.
  const regionLabel = tCommon('filters.regionLabel')

  // Level state: null = hub; otherwise the open def's id (or SORT_ID).
  const [editorId, setEditorId] = useState<string | null>(null)
  // Hub-row refs for focus return on editor -> hub: the focused back button
  // unmounts with the editor level, so without an explicit return focus
  // falls to <body>.
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  // The row to refocus after the hub becomes visible again. The hub is
  // CSS-hidden while an editor is open, and a browser refuses to focus an
  // element inside a display:none subtree - so the focus call must wait for
  // the commit that re-shows the hub.
  const pendingFocusRef = useRef<string | null>(null)

  // Close/reset adjust (prev-latch form - editorId does not gate mounting,
  // so the latch cannot get stuck): every close path the sheet cannot
  // observe (scrim, Escape at hub level, the footer button, the page's own
  // open-flag writes) funnels through the parent's open=false - reset the
  // level so the next open starts at the hub. Loop-safe: each write lands
  // on a value that disproves its own guard.
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) setEditorId(null)
  }

  const stepBack = () => {
    pendingFocusRef.current = editorId
    setEditorId(null)
  }

  // DOM-only effect (no state writes): once the level flip commits and the
  // hub is visible again, move focus to the row that opened the editor.
  useLayoutEffect(() => {
    const id = pendingFocusRef.current
    if (id === null) return
    pendingFocusRef.current = null
    rowRefs.current[id]?.focus()
  }, [editorId])

  const onClear = (def: FilterDef<V, L>) => updateParams(def.clear())

  // Only offerable defs get hub rows: an unavailable facet (single account,
  // mono-currency, no budgets) cannot bind anything on this workspace. A
  // stale param replayed from a bookmark still counts in the badge and
  // still clears - it just has no row while the facet is empty here.
  const offered = filters.filter((d) => d.available)
  const activeDef =
    editorId !== null && editorId !== SORT_ID
      ? (filters.find((d) => d.id === editorId) ?? null)
      : null
  const editorHeading =
    editorId === SORT_ID
      ? t('listFilters.sortLabel')
      : activeDef !== null
        ? filterLabel(activeDef.labelKey)
        : ''

  return (
    <BottomSheet open={open} onClose={onClose} aria-label={regionLabel}>
      {/* Hub header (the action-sheet title idiom). */}
      <div className="px-4 pt-1 pb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted truncate">
        {regionLabel}
      </div>

      {/* The hub stays MOUNTED while an editor is open, hidden by class:
          the rows' refs must stay live so stepping back can refocus the
          row that opened the editor (an unmounted row would drop focus to
          <body>). The hidden class also removes the hub from the a11y tree,
          so screen readers see one level at a time. */}
      <div className={`border-t border-border divide-y divide-border${editorId !== null ? ' hidden' : ''}`}>
          {offered.map((def) => {
            const active = def.isActive(values, lookups)
            // Summaries are only defined for active facets; an inactive row
            // shows its label alone (the registry's "all" placeholder is
            // the host's to render, and an empty fragment reads as all).
            const summary = active ? def.summarize(values, lookups) : ''
            return (
              // Wrapper because the row button and its clear button are
              // siblings (a button may never descend from a button). The
              // active marker is the sidebar active-nav idiom: a left
              // accent bar plus a surface tint, never color-alone - the
              // summary text also differs and the clear button appears
              // only on active rows. Inactive rows reserve the bar's space
              // (transparent left border) so text never shifts on toggle.
              <div
                key={def.id}
                className={active ? 'border-l-2 border-primary bg-surface-hover' : 'border-l-2 border-l-transparent'}
              >
                <div className="flex items-center">
                  <button
                    type="button"
                    ref={(el) => {
                      rowRefs.current[def.id] = el
                    }}
                    onClick={() => setEditorId(def.id)}
                    className="w-full min-h-[44px] px-4 flex items-center gap-3 text-left text-sm text-text transition-colors active:bg-surface-hover"
                  >
                    <span className="flex-1 min-w-0 truncate">{filterLabel(def.labelKey)}</span>
                    <span className="text-xs text-text-muted truncate">{summary}</span>
                  </button>
                  {active && (
                    <button
                      type="button"
                      onClick={() => onClear(def)}
                      aria-label={t('listFilters.clearAria')}
                      className="shrink-0 flex items-center justify-center min-h-[44px] pointer-coarse:min-w-[44px] px-3 text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      <X size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
          {/* Sort row: no left accent bar (sorting never filters), the
              summary is the current option's label, and there is no clear
              button - the default option is always selectable instead. */}
          {sort && (
            <div className="border-l-2 border-l-transparent">
              <div className="flex items-center">
                <button
                  type="button"
                  ref={(el) => {
                    rowRefs.current[SORT_ID] = el
                  }}
                  onClick={() => setEditorId(SORT_ID)}
                  className="w-full min-h-[44px] px-4 flex items-center gap-3 text-left text-sm text-text transition-colors active:bg-surface-hover"
                >
                  <span className="flex-1 min-w-0 truncate">{t('listFilters.sortLabel')}</span>
                  <span className="text-xs text-text-muted truncate">
                    {sort.options.find((o) => o.value === sort.value)?.label}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

      {editorId !== null && (
        <div
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            // Element-level consume. preventDefault + stopPropagation, both
            // load-bearing: the sheet-level Escape listener is a
            // document-level bubble-phase keydown that never checks
            // defaultPrevented, so only stopping propagation keeps this
            // press from closing the whole sheet. Focus sits inside this
            // container (the back button autofocuses on entry), so the
            // container is in the event path - the same idiom as a popup
            // consuming Escape inside a modal. No document-level listener
            // here: a closed popup would then swallow the sheet's close.
            e.preventDefault()
            e.stopPropagation()
            stepBack()
          }}
        >
          <div className="sticky top-0 z-10 bg-surface flex items-center gap-2 px-2 py-1 border-b border-border">
            <button
              type="button"
              // Entry focus: fires when this level mounts, putting focus
              // (and thus the Escape event path) inside the container.
              autoFocus
              onClick={stepBack}
              aria-label={t('listFilters.backAria')}
              className="flex items-center justify-center rounded-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus min-h-8 min-w-8 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]"
            >
              <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <span className="text-sm font-medium text-text truncate">{editorHeading}</span>
          </div>
          <div className="pb-2">
            {editorId === SORT_ID && sort ? (
              <SingleChoiceEditor
                value={sort.value}
                options={sort.options}
                onChange={(v) => {
                  if (v !== null) sort.onChange(v)
                }}
                aria-label={t('listFilters.sortLabel')}
              />
            ) : activeDef !== null ? (
              renderEditor(activeDef)
            ) : null}
          </div>
        </div>
      )}

      {/* Save actions - the toolbar's labels verbatim; on phones these live
          here instead of the toolbar row. */}
      <div className="border-t border-border divide-y divide-border">
        <button
          type="button"
          onClick={onSaveDefaults}
          disabled={saveDefaultsPending}
          className="w-full min-h-[44px] px-4 flex items-center gap-3 text-sm text-left text-text transition-colors active:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={16} strokeWidth={1.5} className="shrink-0" />
          {saveDefaultsPending ? saveDefaultsPendingLabel : saveDefaultsLabel}
        </button>
        {bookmark && (
          <button
            type="button"
            onClick={bookmark.onOpen}
            aria-label={bookmark.ariaLabel}
            className="w-full min-h-[44px] px-4 flex items-center gap-3 text-sm text-left text-text transition-colors active:bg-surface-hover"
          >
            <BookmarkPlus size={16} strokeWidth={1.5} className="shrink-0" />
            {bookmark.label}
          </button>
        )}
      </div>

      {/* Footer: full-width primary, closes the sheet. The count renders
          font-mono (the bookmark-modal numeral idiom); while the list
          refetches the previous total shows - intended. The phone floor
          co-applies with the coarse-pointer floor at the same 44px, so
          compiled-sheet order between them is irrelevant. */}
      <div className="sticky bottom-0 bg-surface border-t border-border p-3">
        <button type="button" onClick={onClose} className={`${primaryButtonClass} w-full max-sm:min-h-[44px]`}>
          {t('listFilters.show')} <span className="font-mono">{total}</span> {footerNoun}
        </button>
      </div>
    </BottomSheet>
  )
}
