import { useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { controlHeightClass } from './formStyles'

interface Props {
  /** Section heading (e.g. "More details"); doubles as the expanded
   *  region's accessible name. UI text - callers pass it through t(). */
  title: string
  /** Optional one-line description shown muted under the title. */
  hint?: string
  /** Controlled only - the caller owns the open/close state, so prefilled
   *  content can arrive with the section already open. */
  open: boolean
  onToggle: () => void
  children: ReactNode
}

/**
 * Collapsible form section. The toggle is a real full-width button carrying
 * aria-expanded; the expansion is its SIBLING region (never nested inside
 * the button - interactive content inside a button is invalid HTML) wired
 * by aria-controls + role="region" + aria-label from ONE useId(). The
 * region stays mounted and hides via the `hidden` CLASS, never the HTML
 * attribute: aria-controls stays resolvable and content (a prefilled note
 * field that arrives with the section already open) survives toggling
 * instead of unmounting.
 */
export default function Disclosure({ title, hint, open, onToggle, children }: Props) {
  // One id for the aria-controls/id pair (the FiltersToggle/FilterBar shape).
  const regionId = useId()

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
        className={
          'w-full flex items-center gap-2 py-1.5 text-left text-xs font-medium text-text ' +
          `hover:bg-surface-hover transition-colors ${controlHeightClass} ` +
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'
        }
      >
        <span className="flex-1">
          <span className="block">{title}</span>
          {hint && <span className="block text-text-muted">{hint}</span>}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          aria-hidden="true"
          className={'text-text-muted shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>
      <div id={regionId} role="region" aria-label={title} className={open ? '' : 'hidden'}>
        {children}
      </div>
    </div>
  )
}
