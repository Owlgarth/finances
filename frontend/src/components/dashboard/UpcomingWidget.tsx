import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addDays } from 'date-fns'
import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { plannedTransactionsApi } from '../../api/client'
import { useMultiCurrency } from '../../hooks/useDomain'
import { formatAmount, formatQuickPickDate } from '../../utils/format'
import { toIsoDate } from '../../utils/dates'
import { PAGE_SIZE_OPTIONS } from '../../utils/pageSize'

// Hoisted so the JSX call site carries no string literal (lint rule: JSX
// expression containers must not hold raw literals; this is a variant
// selector, not UI text).
const SHORT_DATE_VARIANT = 'date' as const

export default function UpcomingWidget() {
  const { t } = useTranslation('dashboard')
  const multiCurrency = useMultiCurrency()
  // Local dates (toIsoDate, never toISOString: the UTC day can sit a day off
  // either end). Stable within the day, so the query key is stable too.
  const to = toIsoDate(addDays(new Date(), 14))
  const from = toIsoDate(new Date())
  const { data, isLoading } = useQuery({
    queryKey: ['planned', 'upcoming', to],
    // No start_date on purpose: overdue pending items are exactly what this
    // widget exists to surface. Ordering does the sort server-side; the
    // backend page-size allowlist starts at PAGE_SIZE_OPTIONS[0] (a
    // disallowed value silently falls back to a full default page), so the
    // request takes the floor and the five-row cap is a client-side slice.
    queryFn: () => plannedTransactionsApi.getAll({ status: 'pending', end_date: to, ordering: 'planned_date', page_size: PAGE_SIZE_OPTIONS[0] }),
  })
  const items = (data?.items ?? []).slice(0, 5)
  const windowSearch = `?from=${from}&to=${to}`
  // A per-row link using the plain window would hide an OVERDUE row on the
  // destination: from=today lower-bounds planned_date, so the clicked row
  // would fall outside the view. Each row's window starts at
  // min(today, the item's own planned_date) so the row that was clicked is
  // always inside the view; the header View-all link keeps the plain
  // 14-day window.
  const rowSearch = (p: { planned_date: string }) =>
    `?from=${p.planned_date < from ? p.planned_date : from}&to=${to}`

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2">
          <CalendarClock size={14} strokeWidth={1.5} /> {t('upcoming.title')}
        </h3>
        <Link to={`/planned${windowSearch}`} className="text-xs text-primary hover:text-primary-hover touch-hit">{t('viewAll')}</Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-6 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-sm space-y-1">
          <p className="text-text-muted">{t('upcoming.empty')}</p>
          <Link to="/planned" className="text-primary hover:text-primary-hover touch-hit">{t('upcoming.emptyAction')}</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Link
              key={p.id}
              to={`/planned${rowSearch(p)}`}
              className="flex items-center justify-between gap-2 text-sm rounded-sm hover:bg-surface-hover transition-colors px-1.5 -mx-1.5"
            >
              <span className="text-text truncate">{p.name}</span>
              <span className="flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-xs text-text-muted">{formatQuickPickDate(p.planned_date, SHORT_DATE_VARIANT)}</span>
                <span className="font-mono text-text">{formatAmount(p.amount)} {multiCurrency ? p.currency_code : ''}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
