import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { currencyExchangesApi } from '../../api/client'
import type { CurrencyExchangeTotalItem } from '../../types'

interface Props {
  periodId: number | null
}

function formatAmount(total: string): string {
  const isNegative = total.startsWith('-')
  const abs = isNegative ? total.slice(1) : total
  const [intPart, decPart = '00'] = abs.split('.')
  const paddedDec = decPart.length < 2 ? decPart.padEnd(2, '0') : decPart.slice(0, 2)
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = isNegative ? '-' : ''
  return `${sign}${formattedInt}.${paddedDec}`
}

function ExchangeRow({ item }: { item: CurrencyExchangeTotalItem }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
      <span className="font-mono text-sm text-negative tabular-nums">
        {formatAmount(item.from_total)} {item.from_currency}
      </span>
      <ArrowRight size={14} className="text-text-muted flex-shrink-0 mx-2" />
      <span className="font-mono text-sm text-positive tabular-nums text-right">
        {formatAmount(item.to_total)} {item.to_currency}
      </span>
    </div>
  )
}

export default function ExchangeActivityWidget({ periodId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['currency-exchanges-totals', periodId],
    queryFn: async () => {
      if (!periodId) return null
      return currencyExchangesApi.getTotals({ budget_period_id: periodId })
    },
    enabled: !!periodId,
  })

  if (!periodId) return null

  const totals = data?.totals ?? []

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <h3 className="font-sans text-sm font-semibold text-text mb-3">Exchange Activity</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 bg-surface-muted rounded-sm animate-pulse" />
          ))}
        </div>
      ) : totals.length === 0 ? (
        <p className="text-sm text-text-muted py-2">No exchange activity this period</p>
      ) : (
        <div>
          {totals.map((item) => (
            <ExchangeRow
              key={`${item.from_currency}-${item.to_currency}`}
              item={item}
            />
          ))}
        </div>
      )}

      <Link
        to="/exchanges"
        className="inline-block mt-3 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
      >
        View Exchanges →
      </Link>
    </div>
  )
}
