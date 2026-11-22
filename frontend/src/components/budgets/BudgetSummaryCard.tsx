import { useTranslation } from 'react-i18next'
import { formatAmount } from '../../utils/format'

interface BudgetSummaryCardProps {
  /** Exact string totals (sumAmounts over the rendered rows - never
   *  summary.totals, whose scope includes archived categories). */
  planned: string
  actual: string
  remaining: string
}

/** Ledger summary for the selected currency: Planned / Actual / Remaining,
 *  each label prefixed by its ledger-color swatch. Stacked label-left /
 *  value-right rows on phones; a 3-column grid from 640px (dormant at the
 *  current sm:hidden mount site - kept so the card is width-correct if a
 *  wider surface ever adopts it). Values are never ledger-colored (the
 *  swatch carries the color); a negative Remaining keeps its minus prefix
 *  in the normal text color. */
export default function BudgetSummaryCard({ planned, actual, remaining }: BudgetSummaryCardProps) {
  const { t } = useTranslation('budgets')
  const rows = [
    { label: t('detail.colPlanned'), value: planned, swatch: 'bg-planned' },
    { label: t('detail.colActual'), value: actual, swatch: 'bg-actual' },
    { label: t('detail.colRemaining'), value: remaining, swatch: 'bg-remaining' },
  ]
  return (
    <div className="bg-surface border border-border rounded-sm p-3 sm:grid sm:grid-cols-3 sm:gap-3">
      {rows.map(({ label, value, swatch }) => (
        <div key={label} className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
          <span className="flex items-center gap-2 text-xs font-medium text-text-muted min-w-0">
            <span className={`w-2.5 h-2.5 rounded-none shrink-0 ${swatch}`} aria-hidden="true" />
            {label}
          </span>
          <span className="font-mono text-xs font-medium tabular-nums text-text whitespace-nowrap">
            {formatAmount(value)}
          </span>
        </div>
      ))}
    </div>
  )
}
