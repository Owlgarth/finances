import type { ReactNode } from 'react'
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
}

interface Props {
  chips: AppliedFilterChip[]
  /** Full clear - the SAME handler the filter panel's Clear link uses
   *  (identical semantics from a second entry point). */
  onClearAll: () => void
}

/** Applied-filter chips for the list pages: one removable chip per active
 *  registry filter except the date range (the stepper owns the date), plus
 *  a "Clear all" link. Renders nothing when no chip is active, so the row
 *  never takes vertical space on an unfiltered list.
 *
 *  640px and up only, CSS-gated: phones are capped at two control rows plus
 *  the Filters entry, where the applied state stays visible through the
 *  toggle's badge count and the sheet's hub rows. The gate is the hidden
 *  CLASS (never the HTML attribute) so the row stays in the accessibility
 *  tree's DOM at every width and simply display-nones below sm.
 *
 *  Chip anatomy: the chip body button and its X button are SIBLINGS inside
 *  a wrapper (a button may never descend from a button). The wrapper owns
 *  the chip skin; the body carries the chip's text and stays a button so it
 *  can host the filter's editor later without changing the remove gesture,
 *  which belongs to the X alone. Rows and X interpolate the full height
 *  constant (min-h-8 fine-pointer base + 44px coarse floor); the icon-only
 *  X also carries the coarse WIDTH floor. */
export default function AppliedFilters({ chips, onClearAll }: Props) {
  const { t } = useTranslation('transactions')
  if (chips.length === 0) return null
  return (
    <div className="hidden sm:flex flex-wrap items-center gap-1.5 mb-3">
      {chips.map((chip) => (
        <div
          key={chip.id}
          className="inline-flex items-stretch border border-border-focus bg-surface-hover rounded-sm"
        >
          <button
            type="button"
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
