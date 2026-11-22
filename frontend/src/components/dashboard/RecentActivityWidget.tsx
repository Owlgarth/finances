import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { transactionsApi } from '../../api/client'
import { useMultiCurrency } from '../../hooks/useDomain'
import { formatAmount } from '../../utils/format'
import { PAGE_SIZE_OPTIONS } from '../../utils/pageSize'

export default function RecentActivityWidget() {
  const { t } = useTranslation('dashboard')
  const multiCurrency = useMultiCurrency()
  // Same family entry the old Home card used: every transaction save's
  // ['transactions'] invalidation keeps refreshing this widget. The backend
  // page-size allowlist starts at PAGE_SIZE_OPTIONS[0] (a disallowed value
  // silently falls back to a full default page), so the request takes the
  // floor and the three-row cap is a client-side slice.
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: () => transactionsApi.getAll({ ordering: '-date', page_size: PAGE_SIZE_OPTIONS[0] }),
  })
  const items = (data?.items ?? []).slice(0, 3)

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2">
          <Receipt size={14} strokeWidth={1.5} /> {t('recent.title')}
        </h3>
        <Link to="/transactions" className="text-xs text-primary hover:text-primary-hover touch-hit">{t('viewAll')}</Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-6 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">{t('recent.empty')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((tx) => (
            <Link
              key={tx.id}
              to={`/transactions/${tx.id}`}
              className="flex items-center justify-between gap-2 text-sm rounded-sm hover:bg-surface-hover transition-colors px-1.5 -mx-1.5"
            >
              <span className="text-text truncate">{tx.description}</span>
              <span className={`font-mono whitespace-nowrap ${tx.type === 'income' ? 'text-positive' : tx.type === 'expense' ? 'text-negative' : 'text-text'}`}>
                {tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : ''}{formatAmount(tx.amount)} {multiCurrency ? tx.currency_code : ''}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
