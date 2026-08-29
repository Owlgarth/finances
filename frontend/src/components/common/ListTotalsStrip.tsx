import type { TransactionTotalItem } from '../../types'

type TotalsTone = 'positive' | 'negative' | 'neutral'

interface ListTotalsStripProps {
  /** Muted leading label, e.g. "Totals - 143 transactions". */
  caption: string
  /** One item per (group, currency) pair present in the result. Currencies
      are never converted - a multi-currency view shows every code. */
  items: TransactionTotalItem[]
  /** Tone of a group's amount (income -> positive, expense -> negative). */
  tone: (group: string) => TotalsTone
  /** Trailing muted note, also exposed as its title tooltip. */
  help?: string
  isLoading: boolean
}

const TONE_CLASS: Record<TotalsTone, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutral: 'text-text',
}

/**
 * Presentational totals strip for the list pages (Transactions, Planned).
 * Purely visual: the owning page runs the query and passes the results -
 * no queries live here.
 */
export default function ListTotalsStrip({ caption, items, tone, help, isLoading }: ListTotalsStripProps) {
  if (!isLoading && items.length === 0) return null

  return (
    <div className="mb-4 text-xs">
      {isLoading ? (
        <div className="h-4 w-64 bg-surface-muted rounded-sm animate-pulse" />
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-text-muted">{caption}</span>
          {items.map((item) => {
            // Currency-grouped totals repeat the code as the group label -
            // rendering "EUR: 100 EUR" is noise, so the label drops there.
            const showGroupLabel = item.group !== item.currency
            return (
              <span key={`${item.group}-${item.currency}`} className="font-mono whitespace-nowrap">
                {showGroupLabel && (
                  <span className="text-text-muted">
                    {item.group.charAt(0).toUpperCase() + item.group.slice(1)}:{' '}
                  </span>
                )}
                <span className={TONE_CLASS[tone(item.group)]}>
                  {item.total} {item.currency}
                </span>
              </span>
            )
          })}
          {help && (
            <span className="text-text-muted" title={help}>
              ({help})
            </span>
          )}
        </p>
      )}
    </div>
  )
}
