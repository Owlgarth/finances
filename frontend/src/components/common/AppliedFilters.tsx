import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { controlHeightClass } from './formStyles'

/** One removable applied-filter chip, resolved by the host page from its
 *  filter registry: the page owns label resolution (namespace), the
 *  summarize() call (its lookups), and the remove write (updateParams over
 *  the def's clear() patch), so this component stays purely presentational
 *  and writes no URLs itself. */
export interface AppliedFilterChip {
  /** Filter-def id - a stable React key. */
  id: string
  /** Resolved filter label ("Budget", "Account"). */
  label: string
  /** Short pre-localized summary ("3 selected" / "Groceries"). Numeric
   *  summaries arrive font-mono-wrapped from the page (a ReactNode absorbs
   *  both plain strings and wrapped fragments). */
  summary: ReactNode
  /** Removes this one filter (the def's clear() patch through the page's
   *  updateParams - a replace write). */
  onRemove: () => void
  /** Present when this chip's body activates something OTHER than the
   *  host's editor popover (the search chip focuses the page's search
   *  input). Suppresses this chip's haspopup/expanded semantics -
   *  focusing an input is not opening a dialog, and the un-suppressed
   *  aria would lie to assistive tech - and routes the body click here
   *  instead of onOpenEditor. Additive: absent = today's behavior. */
  onBodyClick?: () => void
}

interface Props {
  chips: AppliedFilterChip[]
  /** Full clear - the SAME handler the filter panel's Clear link uses
   *  (identical semantics from a second entry point). */
  onClearAll: () => void
  /** Toolbar membership: the host row owns the 640+ gate and the row
   *  spacing, so this drops the component's own width gate and bottom
   *  margin. Standalone usage (no host row) keeps both by default. */
  inline?: boolean
  /** Chip body click opens the filter's editor popover. Provided exactly
   *  when the host renders editor popovers; without it the chip body stays
   *  an inert label (the X alone removes). */
  onOpenEditor?: (defId: string) => void
  /** The chip whose editor popover is open, or null when none. The opening
   *  chip becomes the popover's anchor. Only meaningful with
   *  onOpenEditor. */
  editorOpenId?: string | null
  /** Builds the editor popover panel hosted under the opening chip. The
   *  host owns the panel chrome and focus; this component only anchors
   *  the returned element under the chip. */
  renderEditorPanel?: (defId: string) => ReactNode
}

/** Applied-filter chips for the list pages: one removable chip per active
 *  registry filter except the date range (the stepper owns the date), plus
 *  a "Clear all" link. Renders nothing when no chip is active, so the row
 *  never takes vertical space on an unfiltered list.
 *
 *  Standalone (no `inline`): 640px and up only, CSS-gated - phones are
 *  capped at two control rows plus the Filters entry, where the applied
 *  state stays visible through the toggle's badge count and the sheet's
 *  hub rows. The gate is the hidden CLASS (never the HTML attribute) so
 *  the row stays in the accessibility tree's DOM at every width and
 *  simply display-nones below sm. Inside the 640+ filter toolbar the
 *  `inline` member drops the gate and margin (the toolbar row owns both).
 *
 *  Chip anatomy: the chip body button and its X button are SIBLINGS inside
 *  a wrapper (a button may never descend from a button). The wrapper owns
 *  the chip skin and, while its editor popover is open, the popover
 *  anchor; the body carries the chip's text and opens the filter's editor
 *  when the host wires `onOpenEditor`, while the remove gesture belongs
 *  to the X alone. Rows and X interpolate the full height
 *  constant (min-h-8 fine-pointer base + 44px coarse floor); the icon-only
 *  X also carries the coarse WIDTH floor. */
export default function AppliedFilters({ chips, onClearAll, inline, onOpenEditor, editorOpenId, renderEditorPanel }: Props) {
  const { t } = useTranslation('transactions')
  // Editor-popover focus return: refs for the chip body buttons (the panel
  // unmounts on close, so the trigger ref must live here) plus a ref
  // carrying the previous open chip id across the close transition.
  const bodyRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const prevOpenRef = useRef<string | null>(editorOpenId ?? null)
  // DOM-only (no state writes): when a chip editor closes, keyboard focus
  // falls out of the removed panel - usually to <body>, and only then does
  // it need a home. A close that swaps to another popover leaves focus on
  // the trigger the user just clicked (not body), so the guard naturally
  // skips it and never steals focus from the new surface.
  useLayoutEffect(() => {
    const prev = prevOpenRef.current
    prevOpenRef.current = editorOpenId ?? null
    if (prev !== null && editorOpenId == null && document.activeElement === document.body) {
      bodyRefs.current[prev]?.focus()
    }
  }, [editorOpenId])
  if (chips.length === 0) return null
  const openId = editorOpenId ?? null
  return (
    <div className={inline ? 'flex flex-wrap items-center gap-1.5' : 'hidden sm:flex flex-wrap items-center gap-1.5 mb-3'}>
      {chips.map((chip) => (
        <div
          key={chip.id}
          className={`inline-flex items-stretch border border-border-focus bg-surface-hover rounded-sm${chip.id === openId ? ' relative' : ''}`}
        >
          <button
            type="button"
            ref={(el) => {
              bodyRefs.current[chip.id] = el
            }}
            onClick={chip.onBodyClick ?? (onOpenEditor ? () => onOpenEditor(chip.id) : undefined)}
            aria-haspopup={!chip.onBodyClick && onOpenEditor ? 'dialog' : undefined}
            aria-expanded={!chip.onBodyClick && onOpenEditor ? openId === chip.id : undefined}
            className={`text-xs px-2 py-1 text-text ${controlHeightClass} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus`}
          >
            <span className="text-text-muted">{chip.label}:</span> {chip.summary}
          </button>
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={t('listFilters.removeFilterAria', { filter: chip.label })}
            className={`flex items-center justify-center px-1 text-text-muted hover:text-text transition-colors ${controlHeightClass} pointer-coarse:min-w-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus`}
          >
            <X size={13} strokeWidth={1.5} aria-hidden="true" />
          </button>
          {chip.id === openId && renderEditorPanel && renderEditorPanel(chip.id)}
        </div>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs text-text-muted hover:text-text transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        {t('listFilters.clearAll')}
      </button>
    </div>
  )
}
