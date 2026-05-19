import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { reportsApi } from '../../api/client'

interface CategoryItem {
  id: number
  category_id: number
  category: string
  currency: string
  budget: number
  actual: number
  difference: number
}

interface Props {
  periodId: number | null
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default function BudgetHealthWidget({ periodId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['budget-summary', periodId],
    queryFn: async () => {
      if (periodId === null) return null
      const response = await reportsApi.budgetSummary(periodId)
      return response.data
    },
    enabled: periodId !== null,
  })

  if (periodId === null) return null

  if (isLoading) {
    return (
      <div className="border border-border rounded-sm bg-surface p-4">
        <h3 className="text-sm font-medium text-text mb-3">Budget Health</h3>
        <div className="text-sm text-text-muted">Loading...</div>
      </div>
    )
  }

  const currencies = data?.currencies || {}
  const currencyKeys = Object.keys(currencies)

  if (currencyKeys.length === 0) {
    return (
      <div className="border border-border rounded-sm bg-surface p-4">
        <h3 className="text-sm font-medium text-text mb-3">Budget Health</h3>
        <p className="text-sm text-text-muted">No budgets set for this period.</p>
        <Link
          to="/budgets"
          className="inline-block mt-3 text-sm text-primary hover:text-primary-hover"
        >
          View Budgets →
        </Link>
      </div>
    )
  }

  // Compute per-currency stats and collect overspent categories
  const allOverspent: CategoryItem[] = []
  const perCurrencyStats: Record<string, { onTrack: number; overBudget: number }> = {}

  for (const [currency, summary] of Object.entries(currencies) as [string, { categories: CategoryItem[] }][]) {
    let onTrack = 0
    let overBudget = 0

    for (const cat of summary.categories) {
      if (cat.difference < 0) {
        overBudget++
        allOverspent.push(cat)
      } else {
        onTrack++
      }
    }

    perCurrencyStats[currency] = { onTrack, overBudget }
  }

  // Sort overspent by absolute difference (most overspent first), take top 5
  const topOverspent = allOverspent
    .sort((a, b) => a.difference - b.difference)
    .slice(0, 5)

  const allOnTrack = topOverspent.length === 0

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <h3 className="text-sm font-medium text-text mb-3">Budget Health</h3>

      {/* Per-currency summary */}
      <div className="space-y-1.5 mb-3">
        {Object.entries(perCurrencyStats).map(([currency, stats]) => (
          <div key={currency} className="text-xs text-text-muted">
            <span className="font-mono font-medium text-text">{currency}</span>:{' '}
            <span className="text-positive">{stats.onTrack} of {stats.onTrack + stats.overBudget} on track</span>
            {stats.overBudget > 0 && (
              <span className="text-negative">, {stats.overBudget} over budget</span>
            )}
          </div>
        ))}
      </div>

      {/* Top overspent categories */}
      {allOnTrack ? (
        <p className="text-sm text-positive mb-3">All categories within budget</p>
      ) : (
        <div className="space-y-2">
          {topOverspent.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between text-xs">
              <div className="flex-1 min-w-0 mr-2">
                <span className="text-text truncate block">{cat.category}</span>
                <span className="text-text-muted font-mono">
                  {formatAmount(cat.actual)} / {formatAmount(cat.budget)} {cat.currency}
                </span>
              </div>
              <span className="text-negative font-mono font-medium tabular-nums whitespace-nowrap">
                {formatAmount(cat.difference)} {cat.currency}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/budgets"
        className="inline-block mt-3 text-sm text-primary hover:text-primary-hover"
      >
        View Budgets →
      </Link>
    </div>
  )
}
