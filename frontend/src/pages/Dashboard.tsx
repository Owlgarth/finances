import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wallet, PieChart, Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { reportsApi, transactionsApi } from '../api/client'
import { useEnabledCurrencies, useMultiCurrency } from '../hooks/useDomain'
import { formatAmount } from '../utils/format'
import BudgetInsights from '../components/dashboard/BudgetInsights'

function BalancesCard() {
  const { t } = useTranslation('dashboard')
  const multiCurrency = useMultiCurrency()
  const { data: currencies = [] } = useEnabledCurrencies()
  const { data, isLoading } = useQuery({ queryKey: ['current-balances', false], queryFn: () => reportsApi.currentBalances(false) })
  // Enabled-currency creation order (the workspace's primary first), stable
  // within a currency (Array.prototype.sort is stable in modern JS engines).
  const rank = new Map(currencies.map((c, i) => [c.code, i]))
  const accounts = [...(data?.accounts ?? [])].sort(
    (a, b) => (rank.get(a.currency_code) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.currency_code) ?? Number.MAX_SAFE_INTEGER),
  )

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2"><Wallet size={14} /> {t('balances.title')}</h3>
        <Link to="/accounts" className="text-xs text-primary hover:text-primary-hover touch-hit">{t('viewAll')}</Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-6 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : (data?.accounts.length ?? 0) === 0 ? (
        <p className="text-sm text-text-muted">{t('balances.empty')}</p>
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <Link
              key={a.account_id}
              to={`/transactions?account=${a.account_id}`}
              className="flex items-center justify-between text-sm rounded-sm hover:bg-surface-hover transition-colors px-1.5 -mx-1.5"
            >
              <span className="text-text truncate mr-2">{a.account_name}</span>
              <span className="font-mono text-text whitespace-nowrap">{formatAmount(a.balance)} {multiCurrency ? a.currency_code : ''}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function RecentTransactions() {
  const { t } = useTranslation('dashboard')
  const multiCurrency = useMultiCurrency()
  const { data, isLoading } = useQuery({ queryKey: ['transactions', 'recent'], queryFn: () => transactionsApi.getAll({ page_size: 6 }) })
  const items = data?.items ?? []

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2"><Receipt size={14} /> {t('recent.title')}</h3>
        <Link to="/transactions" className="text-xs text-primary hover:text-primary-hover touch-hit">{t('viewAll')}</Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-6 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">{t('recent.empty')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between text-sm">
              <span className="text-text truncate mr-2">{tx.description}</span>
              <span className={`font-mono whitespace-nowrap ${tx.type === 'income' ? 'text-positive' : tx.type === 'expense' ? 'text-negative' : 'text-warning'}`}>
                {tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : ''}{formatAmount(tx.amount)} {multiCurrency ? tx.currency_code : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { t } = useTranslation('dashboard')
  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-text mb-6">{t('title')}</h1>
      <BudgetInsights />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BalancesCard />
        <RecentTransactions />
        <Link to="/budgets" className="border border-border rounded-sm bg-surface p-4 hover:bg-surface-hover transition-colors md:col-span-2 flex items-center gap-2 text-sm text-text">
          <PieChart size={14} className="text-text-muted" /> {t('budgetsLink')}
        </Link>
      </div>
    </div>
  )
}
