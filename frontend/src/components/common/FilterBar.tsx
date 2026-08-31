import { SlidersHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { controlHeightClass, labelClass } from './formStyles'

/**
 * List-page filter scaffolding (Transactions, Planned): a toggle button with an
 * active-filter count, and the disclosure panel its controls live in. The pages
 * own the actual filter state (URL search params) and controls.
 */

interface FiltersToggleProps {
  open: boolean
  /** Number of active filters — shown as a badge so a collapsed panel never hides state. */
  count: number
  onToggle: () => void
  /** id of the FilterPanel this toggle controls — accordion wiring (skill:
      toggle carries aria-expanded + aria-controls; region is its sibling).
      Optional so current call sites stay valid; pages wire it in Task 10. */
  'aria-controls'?: string
}

export function FiltersToggle({ open, count, onToggle, 'aria-controls': ariaControls }: FiltersToggleProps) {
  const { t } = useTranslation('common')
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={ariaControls}
      className={`bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors inline-flex items-center gap-1.5 ${controlHeightClass} flex-shrink-0`}
    >
      <SlidersHorizontal size={13} />
      {t('filters.toggle')}
      {count > 0 && (
        <span className="min-w-[16px] h-4 px-1 rounded-sm bg-primary text-white text-[10px] font-mono inline-flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  )
}

interface FilterPanelProps {
  children: ReactNode
  /** "Clear filters" handler; the link renders only when a filter is active. */
  onClear?: (() => void) | null
  /** id shared with FiltersToggle's aria-controls — identifies this region
      to the toggle (accordion rule: id + role="region" + aria-label). */
  id?: string
}

export function FilterPanel({ children, onClear, id }: FilterPanelProps) {
  const { t } = useTranslation('common')
  return (
    <div
      id={id}
      role="region"
      aria-label={t('filters.regionLabel')}
      className="border border-border rounded-sm bg-surface p-3 mb-4"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 text-xs text-text-muted hover:text-text transition-colors max-sm:min-h-[44px]"
        >
          {t('filters.clear')}
        </button>
      )}
    </div>
  )
}

interface FilterFieldProps {
  label: string
  htmlFor?: string
  children: ReactNode
  /** Grid span override (e.g. amount/date pairs sharing one cell). */
  className?: string
}

export function FilterField({ label, htmlFor, children, className = '' }: FilterFieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  )
}
