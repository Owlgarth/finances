import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { reportsApi } from '../../api/client'
import { useEnabledCurrencies, useMultiCurrency } from '../../hooks/useDomain'
import { formatAmount, sumAmounts } from '../../utils/format'

export default function AccountsWidget() {
  const { t } = useTranslation('dashboard')
  const multiCurrency = useMultiCurrency()
  const { data: currencies = [] } = useEnabledCurrencies()
  const { data, isLoading } = useQuery({
    queryKey: ['current-balances', false],
    queryFn: () => reportsApi.currentBalances(false),
  })
  // Enabled-currency creation order (the workspace's primary first), stable
  // within a currency.
  const rank = new Map(currencies.map((c, i) => [c.code, i]))
  const accounts = [...(data?.accounts ?? [])].sort(
    (a, b) => (rank.get(a.currency_code) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.currency_code) ?? Number.MAX_SAFE_INTEGER),
  )
  // Per-currency totals over exactly the rows rendered above: exact BigInt
  // sums, one row per currency present, never one converted figure. Codes
  // are the row LABEL here (registry data renders verbatim), not an amount
  // suffix, so they show in single-currency workspaces too.
  const totals = Object.entries(
    accounts.reduce<Record<string, string[]>>((acc, a) => {
      ;(acc[a.currency_code] ??= []).push(a.balance)
      return acc
    }, {}),
  ).map(([code, balances]) => ({ code, total: sumAmounts(balances) }))

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2">
          <Wallet size={14} strokeWidth={1.5} /> {t('balances.title')}
        </h3>
        <Link to="/accounts" className="text-xs text-primary hover:text-primary-hover touch-hit">{t('viewAll')}</Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-6 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : accounts.length === 0 ? (
        <div className="text-sm space-y-1">
          <p className="text-text-muted">{t('balances.empty')}</p>
          <Link to="/accounts" className="text-primary hover:text-primary-hover touch-hit">{t('balances.emptyAction')}</Link>
        </div>
      ) : (
        <div>
          <div className="space-y-2">
            {accounts.map((a) => (
              <Link
                key={a.account_id}
                to={`/accounts/${a.account_id}`}
                className="flex items-center justify-between text-sm rounded-sm hover:bg-surface-hover transition-colors px-1.5 -mx-1.5"
              >
                <span className="text-text truncate mr-2">{a.account_name}</span>
                <span className="font-mono text-text whitespace-nowrap">
                  {formatAmount(a.balance)} {multiCurrency ? a.currency_code : ''}
                </span>
              </Link>
            ))}
          </div>
          <div className="border-t border-border mt-3 pt-3 space-y-1.5">
            {totals.map(({ code, total }) => (
              <div key={code} className="flex items-center justify-between text-sm">
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  {t('balances.total')} {code}
                </span>
                <span className="font-mono text-text whitespace-nowrap">{formatAmount(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
