import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BookmarkPlus, ChevronDown, Plus, Save } from 'lucide-react'
import AppliedFilters, { type AppliedFilterChip } from '../common/AppliedFilters'
import { controlHeightClass, secondaryButtonClass } from '../common/formStyles'
import { listboxPanelClass } from '../common/listboxParts'
import type { FilterDef } from '../../utils/listFilters'

/**
 * Editor-popover panel. Same anchor/border/bg/z idiom as the shared
 * listbox panel class, but sized for a filter editor body instead of a
 * listbox: the range calendar's editor is far taller than a listbox's
 * 280px cap, and a bare fit-to-content width would let the presets row
 * drive the panel width - so the width floors at the range calendar's
 * natural span and caps at the viewport, and long content wraps instead
 * of widening.
 */
export const filterEditorPanelClass =
  'absolute z-dropdown mt-1 min-w-[336px] max-w-[calc(100vw-3rem)] ' +
  'bg-surface border border-border rounded-sm p-3 ' +
  'max-h-[min(560px,calc(100dvh-10rem))] overflow-y-auto'

/** Menu rows interpolate the full height constant (the fine-pointer
 *  min-h-8 base plus the 44px coarse floor - touch tablets in the 640-1023
 *  band get these popovers), with the menu typography contract: 13px text,
 *  14px icons. */
const menuRowClass =
  'w-full flex items-center gap-2.5 px-3 text-left text-[13px] text-text ' +
  `hover:bg-surface-hover transition-colors ${controlHeightClass} ` +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'

/** One open popover at a time across the whole row, by construction: a
 *  single state slot every trigger swaps into. The `via` member records
 *  which surface opened an editor so the panel anchors under it (the Add
 *  filter trigger or the chip that was clicked). */
type ToolbarPopover =
  | { kind: 'date' }
  | { kind: 'editor'; defId: string; via: 'add' | 'chip' }
  | { kind: 'addMenu' }
  | { kind: 'saveMenu' }

export interface SaveViewSlot {
  /** Fires the page's save-default mutation. */
  onSaveDefaults: () => void
  /** "Save as default" row label - the page's saveDefaults key. */
  saveDefaultsLabel: string
  saveDefaultsPending?: boolean
  saveDefaultsPendingLabel?: string
  /** Bookmark action; absent on pages with no bookmark kind (a one-item
   *  menu). The menu closes BEFORE the bookmark modal mounts so the two
   *  overlays never stack. */
  onSaveBookmark?: () => void
  bookmarkLabel?: string
}

interface FilterChipsBarProps<V, L> {
  /** The page's registry list (display order). */
  filters: FilterDef<V, L>[]
  /** The page's EFFECTIVE facet values - the same object the badge reads,
   *  so the Add-filter menu and the chips agree by construction. */
  values: V
  /** Lookups passed straight through to isActive. */
  lookups: L
  /** Resolves registry labelKeys through the page's own namespace helper
   *  (plain keys live in page namespaces, cross-page ones 'ns:'-qualified). */
  filterLabel: (key: string) => string
  /** Resolved applied chips (minus the date range - the stepper owns it)
   *  and the shared clear-all, exactly as the standalone chips row
   *  received them. */
  chips: AppliedFilterChip[]
  onClearAll: () => void
  /** Page wires each def to its editor body with options + URL writes:
   *  each def's editor needs page-derived option lists, which this
   *  component must not know about. Every change applies to the URL
   *  immediately (the editors' own full-snapshot contract). */
  renderEditor: (def: FilterDef<V, L>) => ReactNode
  /** Stepper member: wire `openDateEditor` into the stepper label's
   *  open-editor handler and `dateEditorOpen` into its expanded state. */
  renderStepper: (helpers: { openDateEditor: () => void; dateEditorOpen: boolean }) => ReactNode
  /** Search member (pages with a search param). Give it a min-width floor
   *  so the wrapping row wraps instead of collapsing it. */
  search?: ReactNode
  /** Sort member (pages with an ordering param) - the existing select,
   *  pinned width, unmodified. */
  sort?: ReactNode
  saveView: SaveViewSlot
}

// Stable attach-callback ref: focuses each editor panel as it mounts so
// keyboard users land inside the editor on open (menus keep focus on
// their trigger - the listbox idiom).
const focusOnAttach = (node: HTMLElement | null) => {
  node?.focus()
}

// Focus return past the current event: a focus call issued inside a
// mousedown listener is overridden by the browser's own default action
// (which resets focus to the click target or <body> once dispatch ends),
// so the return focus lands one macrotask later.
const deferFocus = (ref: { current: HTMLElement | null }) => {
  setTimeout(() => ref.current?.focus(), 0)
}

/**
 * The 640px-and-up filter toolbar for the three Activity lists: month
 * stepper (its label opens the date editor popover), applied chips (a
 * chip body opens that filter's editor), an "Add filter" menu of inactive
 * filters, optional search and sort members, and a "Save view" menu.
 * One wrapping flex row; CSS-gated (hidden below sm, where the phone
 * filter sheet owns filtering); one popover open at a time, tracked in a
 * single state slot. Shared chrome self-translates through the
 * transactions namespace (the established cross-page filter home);
 * page-specific members arrive as slots.
 *
 * Escape is consumed here (document bubble-phase preventDefault +
 * stopPropagation) so nothing beneath the row reacts; the sort member's
 * own Escape handling is consumed inside its trigger and stops at the
 * React root, so it never reaches this listener. The editors themselves
 * carry no Escape handling by contract - this row owns it for every
 * popover it hosts.
 */
export default function FilterChipsBar<V, L>({
  filters,
  values,
  lookups,
  filterLabel,
  chips,
  onClearAll,
  renderEditor,
  renderStepper,
  search,
  sort,
  saveView,
}: FilterChipsBarProps<V, L>) {
  const { t } = useTranslation('transactions')
  const [openPopover, setOpenPopover] = useState<ToolbarPopover | null>(null)
  // The row wrapper contains every trigger AND every panel: one
  // outside-click listener on it closes the popover only for clicks that
  // truly leave the row (a click on another member lets that member's own
  // handler swap the popover).
  const rowRef = useRef<HTMLDivElement>(null)
  // Focus return on close for the triggers this row owns (chip-opened
  // editors return focus inside the chips row, its own contract).
  const addTriggerRef = useRef<HTMLButtonElement>(null)
  const saveTriggerRef = useRef<HTMLButtonElement>(null)
  const stepperWrapRef = useRef<HTMLDivElement>(null)

  const closePopover = (refocus = true) => {
    if (openPopover?.kind === 'addMenu' || (openPopover?.kind === 'editor' && openPopover.via === 'add')) {
      setOpenPopover(null)
      if (refocus) deferFocus(addTriggerRef)
    } else if (openPopover?.kind === 'saveMenu') {
      setOpenPopover(null)
      if (refocus) deferFocus(saveTriggerRef)
    } else if (openPopover?.kind === 'date') {
      setOpenPopover(null)
      if (refocus) deferFocus(stepperWrapRef)
    } else {
      setOpenPopover(null)
    }
  }
  // The dismissal listeners fire the CURRENT close path through a
  // latest-ref: a mount-time closure would refocus the trigger of a
  // popover already swapped away.
  const closeRef = useRef(closePopover)
  useEffect(() => {
    closeRef.current = closePopover
  })

  const open = openPopover !== null
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        // A click landing on a focusable element moves focus there through
        // the browser's own default action - never steal it. Anything else
        // dismisses the popover and hands focus back to its trigger.
        const target = e.target as HTMLElement | null
        const focusable = target && target.closest('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')
        closeRef.current(!focusable)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Consumed Escape: nothing beneath this row reacts to the press.
      e.preventDefault()
      e.stopPropagation()
      closeRef.current()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Only offerable defs may enter the Add-filter menu: an unavailable
  // facet (single account, mono-currency, no budgets) cannot bind
  // anything on this workspace. Active defs are excluded by definition -
  // an entry here is never a no-op.
  const inactiveDefs = filters.filter((d) => d.available && !d.isActive(values, lookups))
  const dateDef = filters.find((d) => d.editor === 'date') ?? null
  const openDef =
    openPopover?.kind === 'editor' ? (filters.find((d) => d.id === openPopover.defId) ?? null) : null
  // Hoisted popover booleans: the literal-string lint flags literal
  // comparisons inside JSX expression containers, and each state drives
  // several JSX arms.
  const dateEditorOpen = openPopover?.kind === 'date'
  const addMenuOpen = openPopover?.kind === 'addMenu'
  const saveMenuOpen = openPopover?.kind === 'saveMenu'
  const editorViaAdd = openPopover?.kind === 'editor' && openPopover.via === 'add'
  const chipEditorId =
    openPopover?.kind === 'editor' && openPopover.via === 'chip' ? openPopover.defId : null

  const toggleDateEditor = () =>
    setOpenPopover((p) => (p?.kind === 'date' ? null : { kind: 'date' }))

  const editorPanel = (def: FilterDef<V, L>) => (
    <div
      className={filterEditorPanelClass}
      role="group"
      aria-label={filterLabel(def.labelKey)}
      tabIndex={-1}
      ref={focusOnAttach}
    >
      {renderEditor(def)}
    </div>
  )

  return (
    <div ref={rowRef} className="hidden sm:flex flex-wrap items-center gap-2 mb-3">
      {/* Stepper, wrapped so the date editor anchors below the label. The
          wrapper (not the label button) receives Escape focus return: the
          stepper component owns its own button and ships no focus
          contract, and a programmatically focusable wrapper is the
          smallest host-side seam. */}
      <div ref={stepperWrapRef} tabIndex={-1} className="relative shrink-0">
        {renderStepper({
          openDateEditor: toggleDateEditor,
          dateEditorOpen,
        })}
        {dateEditorOpen && dateDef !== null && editorPanel(dateDef)}
      </div>

      {/* Applied chips: the chips group also hosts chip-opened editors
          (anchored under the chip that was clicked). */}
      <AppliedFilters
        inline
        chips={chips}
        onClearAll={onClearAll}
        onOpenEditor={(defId) =>
          setOpenPopover((p) => (p?.kind === 'editor' && p.defId === defId ? null : { kind: 'editor', defId, via: 'chip' }))
        }
        editorOpenId={chipEditorId}
        renderEditorPanel={(defId) => {
          const def = filters.find((f) => f.id === defId)
          return def ? editorPanel(def) : null
        }}
      />

      {/* Add filter: a menu of inactive defs; picking one swaps straight
          into that def's editor (one transition - the menu closes as the
          editor opens). Disabled when every offerable def is active. */}
      <div className="relative shrink-0">
        <button
          ref={addTriggerRef}
          type="button"
          disabled={inactiveDefs.length === 0}
          aria-haspopup="menu"
          aria-expanded={addMenuOpen}
          onClick={() => setOpenPopover((p) => (p?.kind === 'addMenu' ? null : { kind: 'addMenu' }))}
          className={`${secondaryButtonClass} shrink-0`}
        >
          <Plus size={13} className="inline mr-1" aria-hidden="true" /> {t('listFilters.addFilter')}
        </button>
        {addMenuOpen && (
          <div role="menu" aria-label={t('listFilters.addFilter')} className={`${listboxPanelClass} py-1`}>
            {inactiveDefs.map((def) => (
              <button
                key={def.id}
                type="button"
                role="menuitem"
                onClick={() => setOpenPopover({ kind: 'editor', defId: def.id, via: 'add' })}
                className={menuRowClass}
              >
                <span className="truncate">{filterLabel(def.labelKey)}</span>
              </button>
            ))}
          </div>
        )}
        {/* An editor opened through the menu anchors under the menu's own
            trigger. */}
        {editorViaAdd && openDef !== null && editorPanel(openDef)}
      </div>

      {search}

      {sort}

      {/* Save view menu: row-end member, its panel anchored to the row's
          right edge. The menu closes BEFORE the bookmark modal mounts so
          Escape always faces one layer. */}
      <div className="relative shrink-0">
        <button
          ref={saveTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={saveMenuOpen}
          onClick={() => setOpenPopover((p) => (p?.kind === 'saveMenu' ? null : { kind: 'saveMenu' }))}
          className={`${secondaryButtonClass} shrink-0`}
        >
          {t('listFilters.saveView')}{' '}
          <ChevronDown
            size={12}
            className={`inline ml-1 transition-transform ${saveMenuOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
        {saveMenuOpen && (
          <div role="menu" aria-label={t('listFilters.saveView')} className={`${listboxPanelClass} right-0 py-1`}>
            <button
              type="button"
              role="menuitem"
              disabled={saveView.saveDefaultsPending}
              onClick={() => {
                // No focus return: the save mutation's toast or the modal
                // this action opens owns the next focus state.
                closePopover(false)
                saveView.onSaveDefaults()
              }}
              className={menuRowClass}
            >
              <Save size={14} strokeWidth={1.5} className="text-text-muted shrink-0" aria-hidden="true" />
              <span className="truncate">
                {saveView.saveDefaultsPending
                  ? (saveView.saveDefaultsPendingLabel ?? saveView.saveDefaultsLabel)
                  : saveView.saveDefaultsLabel}
              </span>
            </button>
            {saveView.onSaveBookmark && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  // No focus return: the bookmark modal mounting next owns
                  // focus (the menu closes first - one Escape layer).
                  closePopover(false)
                  saveView.onSaveBookmark?.()
                }}
                className={menuRowClass}
              >
                <BookmarkPlus size={14} strokeWidth={1.5} className="text-text-muted shrink-0" aria-hidden="true" />
                <span className="truncate">{saveView.bookmarkLabel}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
