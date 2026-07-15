import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wallet, PieChart, Receipt } from 'lucide-react'
import { reportsApi, transactionsApi } from '../api/client'
import { useMultiCurrency } from '../hooks/useDomain'
import { formatAmount } from '../utils/format'
import BudgetInsights from '../components/dashboard/BudgetInsights'

function BalancesCard() {
  const multiCurrency = useMultiCurrency()
  const { data, isLoading } = useQuery({ queryKey: ['current-balances', false], queryFn: () => reportsApi.currentBalances(false) })

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2"><Wallet size={14} /> Accounts</h3>
        <Link to="/accounts" className="text-xs text-primary hover:text-primary-hover touch-hit">View all →</Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-6 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : (data?.accounts.length ?? 0) === 0 ? (
        <p className="text-sm text-text-muted">No accounts.</p>
      ) : (
        <div className="space-y-2">
          {data!.accounts.map((a) => (
            <div key={a.account_id} className="flex items-center justify-between text-sm">
              <span className="text-text truncate mr-2">{a.account_name}</span>
              <span className="font-mono text-text whitespace-nowrap">{formatAmount(a.balance)} {multiCurrency ? a.currency_code : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RecentTransactions() {
  const multiCurrency = useMultiCurrency()
  const { data, isLoading } = useQuery({ queryKey: ['transactions', 'recent'], queryFn: () => transactionsApi.getAll({ page_size: 6 }) })
  const items = data?.items ?? []

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2"><Receipt size={14} /> Recent activity</h3>
        <Link to="/transactions" className="text-xs text-primary hover:text-primary-hover touch-hit">View all →</Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-6 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">No transactions yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              <span className="text-text truncate mr-2">{t.description}</span>
              <span className={`font-mono whitespace-nowrap ${t.type === 'income' ? 'text-positive' : t.type === 'expense' ? 'text-negative' : 'text-warning'}`}>
                {t.type === 'expense' ? '−' : t.type === 'income' ? '+' : ''}{formatAmount(t.amount)} {multiCurrency ? t.currency_code : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-text mb-6">Dashboard</h1>
      <BudgetInsights />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BalancesCard />
        <RecentTransactions />
        <Link to="/budgets" className="border border-border rounded-sm bg-surface p-4 hover:bg-surface-hover transition-colors md:col-span-2 flex items-center gap-2 text-sm text-text">
          <PieChart size={14} className="text-text-muted" /> Manage budgets and category plans →
        </Link>
      </div>
    </div>
  )
}
