import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { transactionsApi } from '../../api/client'
import { formatAmount } from '../../utils/format'

interface Props {
  periodId: number | null
}

export default function FrequentSpendingWidget({ periodId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['frequent-descriptions', periodId],
    queryFn: async () => {
      if (!periodId) return null
      return transactionsApi.getFrequentDescriptions({
        budget_period_id: periodId,
        limit: 5,
      })
    },
    enabled: !!periodId,
  })

  if (!periodId) return null

  const items = data?.items ?? []

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <h3 className="text-sm font-medium text-text mb-3">Frequent Spending</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 bg-surface-muted rounded-sm animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">No spending data this period.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={`${item.description}-${item.currency}`} className="flex items-center justify-between text-xs">
              <div className="flex-1 min-w-0 mr-2">
                <ChevronRight size={14} className="text-text-muted mr-1 inline-block align-text-bottom" />
                <span className="text-text truncate">{item.description}</span>
              </div>
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-text-muted">{item.count}x</span>
                <span className="font-mono tabular-nums text-text">
                  {formatAmount(item.total)} {item.currency}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/transactions"
        className="inline-block mt-3 text-sm text-primary hover:text-primary-hover"
      >
        View Transactions →
      </Link>
    </div>
  )
}
