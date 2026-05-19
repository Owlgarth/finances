import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { addDays, differenceInCalendarDays, format, startOfDay } from 'date-fns'
import { plannedTransactionsApi } from '../../api/client'
import { useBudgetPeriod } from '../../contexts/BudgetPeriodContext'
import type { PlannedTransaction, PaginatedResponse } from '../../types'

interface CountdownLabel {
  text: string
  color: string
}

function getCountdownLabel(plannedDate: string): CountdownLabel {
  const today = startOfDay(new Date())
  const target = startOfDay(new Date(plannedDate))
  const diff = differenceInCalendarDays(target, today)

  if (diff <= 0) {
    return { text: 'Today', color: 'text-primary' }
  }
  if (diff === 1) {
    return { text: 'Tomorrow', color: 'text-primary' }
  }
  return { text: `${diff} days`, color: 'text-text-muted' }
}

function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function PlannedRow({ planned }: { planned: PlannedTransaction }) {
  const countdown = getCountdownLabel(planned.planned_date)

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0 mr-2">
        <span className="text-sm text-text truncate block">{planned.name}</span>
        <span className="text-xs text-text-muted font-mono tabular-nums">
          {formatAmount(planned.amount)} {planned.currency}
        </span>
      </div>
      <div className="flex-shrink-0 text-right">
        <span className={`text-xs font-medium ${countdown.color}`}>{countdown.text}</span>
        <span className="block text-xs text-text-muted">
          {format(new Date(planned.planned_date), 'MMM d')}
        </span>
      </div>
    </div>
  )
}

export default function UpcomingPlannedWidget() {
  const { selectedPeriodId } = useBudgetPeriod()

  const today = format(startOfDay(new Date()), 'yyyy-MM-dd')
  const nextWeek = format(addDays(startOfDay(new Date()), 7), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery({
    queryKey: ['planned-transactions-upcoming', selectedPeriodId, today, nextWeek],
    queryFn: async () => {
      if (!selectedPeriodId) return null
      const response = await plannedTransactionsApi.getAll({
        status: 'pending',
        budget_period_id: selectedPeriodId,
        start_date: today,
        end_date: nextWeek,
      })
      return response.data as PaginatedResponse<PlannedTransaction>
    },
    enabled: !!selectedPeriodId,
  })

  if (!selectedPeriodId) return null

  const items = data?.items ?? []

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <h3 className="font-sans text-sm font-semibold text-text mb-3">Upcoming Planned</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 bg-surface-muted rounded-sm animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted py-2">No planned transactions this week</p>
      ) : (
        <div>
          {items.map((planned) => (
            <PlannedRow key={planned.id} planned={planned} />
          ))}
        </div>
      )}

      <Link
        to="/planned"
        className="inline-block mt-3 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
      >
        View Planned →
      </Link>
    </div>
  )
}
