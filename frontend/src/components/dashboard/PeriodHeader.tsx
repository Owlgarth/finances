import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { BudgetPeriod } from '../../types'

interface Props {
  period: BudgetPeriod
}

function formatRange(start: string, end: string): string {
  const startDate = parseISO(start)
  const endDate = parseISO(end)
  const startFmt = format(startDate, 'MMM d')
  const endFmt = format(endDate, 'MMM d, yyyy')
  return `${startFmt} – ${endFmt}`
}

export default function PeriodHeader({ period }: Props) {
  const start = parseISO(period.start_date)
  const end = parseISO(period.end_date)
  const today = new Date()

  const totalDays = differenceInCalendarDays(end, start) + 1
  const elapsedDays = differenceInCalendarDays(today, start) + 1

  const clampedElapsed = Math.max(0, Math.min(elapsedDays, totalDays))
  const percentage = Math.round((clampedElapsed / totalDays) * 100)

  return (
    <div className="mb-8">
      <h1 className="text-lg font-semibold text-text">{period.name}</h1>
      <p className="text-sm text-text-muted mt-1">
        {formatRange(period.start_date, period.end_date)}
      </p>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
          <span>{clampedElapsed}/{totalDays} days elapsed</span>
          <span>{percentage}%</span>
        </div>
        <div className="h-1.5 bg-surface-muted rounded-sm overflow-hidden">
          <div
            className="h-full bg-primary rounded-sm transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  )
}
