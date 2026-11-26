import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { isAheadOfPace } from '../../utils/budgetPace'
import { parseAmountNumber } from '../../utils/amountInput'

export interface BudgetBarProps {
  /** Spent and planned in the API's exact Decimal strings. The fill width
   *  is display-only float math over them and is never sent back. */
  spent: string
  planned: string
  /** The fill's color class. Each surface keeps its own severity rule (the
   *  phone cards and the Home widget split at 75%, the currency chips and
   *  the transaction record at 75% and 95%), so the bar never derives it. */
  fillClass: string
  /** Share of the period already elapsed, 0 to 1 (elapsedShare in
   *  utils/budgetPace.ts). A number draws the tick. null or undefined, a
   *  period that does not contain today, draws no tick and no pace word. */
  elapsed?: number | null
  /** The row's status word, already translated by the caller. Absent where
   *  the bar has no status (the currency chips, the transaction record). */
  statusWord?: ReactNode
  /** Color class of the status word. The pace word shares it when the two
   *  are joined. Defaults to text-text-muted. */
  statusWordClass?: string
  /** The figure at the row's right end ("30.00 left", a percent). */
  trailing?: ReactNode
  /** Color class of the trailing figure. Defaults to text-text-muted. */
  trailingClass?: string
  /** Classes for the track element, for the site's own spacing around it. */
  className?: string
}

/**
 * The budget bars' one track: a 4px muted track, a fill as wide as the
 * spent share, a 1px tick where the period's elapsed share sits, and one
 * status row under it. The tick and the pace word are drawn together or
 * not at all, so the tick is never the only signal that spending runs
 * ahead of the period.
 *
 * The tick is the text color and stands 2px above and below the track, so
 * it stays readable on either side of the fill, including once the fill
 * has passed it. That is why the track never clips: a clipping track would
 * cut the tick down to the 4px band, where no color tells it from the
 * primary fill. The fill is clamped to the track's width instead.
 *
 * While the tick shows, the track is a named image whose name carries
 * the elapsed share. Without a tick the track is hidden from
 * assistive technology. It is never both: the words beside the bar are
 * real text, and on three of the four sites the bar sits inside a control
 * whose name comes from its content.
 *
 * The row wraps by whole phrase: a cell never breaks inside itself, and
 * the trailing figure drops to a second line, right-aligned, when both
 * cells do not fit. Nothing truncates.
 *
 * With no plan (planned is 0) the fill is empty. The tick is unaffected.
 */
export default function BudgetBar({
  spent,
  planned,
  fillClass,
  elapsed,
  statusWord,
  statusWordClass,
  trailing,
  trailingClass,
  className,
}: BudgetBarProps) {
  const { t } = useTranslation('common')
  const tickShows = elapsed != null
  // The track's name, read only while the tick shows.
  const trackName = elapsed == null ? undefined : t('budgetBar.periodGone', { share: Math.round(elapsed * 100) })
  const showPaceWord = isAheadOfPace(spent, planned, elapsed ?? null)
  const hasStatusWord = statusWord != null

  const plannedNum = parseAmountNumber(planned) ?? 0
  const actualNum = parseAmountNumber(spent) ?? 0
  const fillPct = plannedNum > 0 ? (actualNum / plannedNum) * 100 : 0
  // Clamped both ways: over the plan fills the track, and a refund can push
  // the ratio below zero, where a negative width is invalid CSS and the fill
  // would render full width.
  const fillWidth = Math.min(Math.max(fillPct, 0), 100)

  // Centered on its share, and on the track's last pixel at 100%.
  const tickLeft = elapsed == null ? undefined : `min(calc(${elapsed * 100}% - 0.5px), calc(100% - 1px))`
  // Built outside JSX on purpose: a string literal inside a JSX expression
  // container trips the no-literal-string lint.
  const trackRole: 'img' | undefined = tickShows ? 'img' : undefined
  // A pace word standing alone is not an attention status, so it is muted.
  const statusColor = hasStatusWord ? (statusWordClass ?? 'text-text-muted') : 'text-text-muted'
  const trackClass = `relative block w-full h-1 bg-surface-muted rounded-none${className ? ` ${className}` : ''}`

  return (
    <>
      <span
        role={trackRole}
        aria-label={trackName}
        aria-hidden={tickShows ? undefined : true}
        className={trackClass}
      >
        <span className={`block h-full rounded-none transition-[width] duration-150 ${fillClass}`} style={{ width: `${fillWidth}%` }} />
        {tickShows && <span className="absolute -top-0.5 h-2 w-px bg-text" style={{ left: tickLeft }} />}
      </span>
      {(hasStatusWord || showPaceWord || trailing != null) && (
        <span className="flex flex-wrap gap-x-2 text-[10px] font-mono font-medium uppercase tracking-wider">
          {(hasStatusWord || showPaceWord) && (
            <span className={`whitespace-nowrap ${statusColor}`}>
              {statusWord}
              {hasStatusWord && showPaceWord && ' · '}
              {showPaceWord && t('budgetBar.aheadOfPace')}
            </span>
          )}
          {trailing != null && (
            <span className={`ml-auto whitespace-nowrap ${trailingClass ?? 'text-text-muted'}`}>{trailing}</span>
          )}
        </span>
      )}
    </>
  )
}
