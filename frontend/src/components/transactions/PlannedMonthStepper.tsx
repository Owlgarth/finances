import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  /** Pre-formatted month label ("October 2026") - the page derives it once
   *  so the stepper and the month empty state share one shape. */
  label: string
  /** +1 = next month, -1 = previous. The page computes the target from the
   *  exactMonth on screen (never from "today") and writes the adjacent
   *  month's from/to params. */
  onShift: (delta: number) => void
}

/** Month stepper (prev chevron, label, next chevron) for the Planned page's
 * planned view. Purely presentational: the page gates rendering on
 * view === 'planned' && exactMonth, so custom/partial ranges and All time
 * never mount this row.
 *
 * BudgetDetailPage's chevron pattern with two deliberate deviations: the
 * focus-visible outline (the source omits it - a pre-existing omission;
 * the design README requires a ring on every interactive element) and
 * strokeWidth 1.5 (global icon rule; the source's default 2 is a
 * pre-existing deviation). The buttons have no inactive state - months run
 * infinitely in both directions. The label span carries aria-live alone
 * (a polite announcement, not a status landmark) and is not focusable or
 * clickable; min-w-[128px] keeps the chevrons in place across locales'
 * month-name widths, with max-sm:flex-1 absorbing the full-width mobile
 * row. */
export default function PlannedMonthStepper({ label, onShift }: Props) {
  const { t } = useTranslation('planned')
  return (
    <div
      className="flex items-center gap-1 mb-3 max-sm:w-full"
      role="group"
      aria-label={t('monthNav.groupAria')}
    >
      <button
        type="button"
        onClick={() => onShift(-1)}
        aria-label={t('monthNav.prevAria')}
        className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <span
        className="font-mono text-xs font-medium text-text min-w-[128px] text-center max-sm:flex-1"
        aria-live="polite"
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => onShift(1)}
        aria-label={t('monthNav.nextAria')}
        className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
      >
        <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  )
}
