import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PieChart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { budgetsApi, reportsApi } from '../../api/client'
import { useBudgets, useMultiCurrency } from '../../hooks/useDomain'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { formatAmount } from '../../utils/format'
import { parseAmountNumber } from '../../utils/amountInput'

/** Display-only ratio rows: parseAmountNumber, never a raw float coercion
 *  of a persisted Decimal string (money rule). */
function attentionRows(items: { category_id: number; category_name: string; currency_code: string; planned: string; actual: string }[]) {
  const scored = items
    .filter((i) => (parseAmountNumber(i.planned) ?? 0) > 0)
    .map((i) => {
      const planned = parseAmountNumber(i.planned) ?? 0
      const actual = parseAmountNumber(i.actual) ?? 0
      return { item: i, pct: (actual / planned) * 100, over: actual > planned }
    })
  scored.sort((a, b) => (a.over === b.over ? b.pct - a.pct : a.over ? -1 : 1))
  return scored.filter((r) => r.over || r.pct >= 75).slice(0, 3)
}

export default function BudgetWidget() {
  const { t } = useTranslation('dashboard')
  const multiCurrency = useMultiCurrency()
  const { workspace } = useWorkspace()
  const { data: budgets = [], isLoading: budgetsLoading } = useBudgets(false)
  const budgetId =
    budgets.find((b) => b.id === workspace?.default_budget_id)?.id ?? budgets[0]?.id ?? null
  const budget = budgets.find((b) => b.id === budgetId) ?? null

  const { data: currentPeriod } = useQuery({
    queryKey: ['current-period', budgetId],
    queryFn: () => budgetsApi.currentPeriod(budgetId!),
    // Data-presence gate: `budget?.cadence !== 'custom'` alone is TRUE while
    // budget is undefined and fires a doomed GET on every visit.
    enabled: budgetId != null && budget != null && budget.cadence !== 'custom',
    retry: false,
  })

  // Same family key as the detail page and the history view, so the periods
  // page's delete invalidations and every save refresh this widget too.
  const { data: summary } = useQuery({
    queryKey: ['budget-summary', budgetId, currentPeriod?.id ?? null],
    queryFn: () => reportsApi.budgetSummary(budgetId!, currentPeriod!.id),
    enabled: budgetId != null && currentPeriod != null,
    placeholderData: (prev) => prev,
  })

  // First-load pendings gate on data presence, not isLoading: the summary
  // stays `enabled: false` (no currentPeriod yet) while its prerequisite
  // resolves, and an isLoading gate would flash the empty branch meanwhile.
  const pending = budgetsLoading || (!!budgetId && !summary && budget?.cadence !== 'custom')

  const attention = useMemo(() => attentionRows(summary?.items ?? []), [summary])
  const totals = Object.entries(summary?.totals ?? {})

  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text flex items-center gap-2">
          <PieChart size={14} strokeWidth={1.5} /> {budget ? budget.name : t('budget.title')}
        </h3>
        {budgetId != null && (
          <Link to={`/budgets/${budgetId}/periods`} className="text-xs text-primary hover:text-primary-hover touch-hit">
            {t('budget.historyLink')}
          </Link>
        )}
      </div>
      {pending ? (
        <div className="space-y-3">
          <div className="h-3 w-24 bg-surface-muted rounded-sm animate-pulse" />
          <div className="h-5 w-28 bg-surface-muted rounded-sm animate-pulse" />
          {[0, 1, 2].map((i) => <div key={i} className="h-8 bg-surface-muted rounded-sm animate-pulse" />)}
        </div>
      ) : budget == null ? (
        <div className="text-sm space-y-1">
          <p className="text-text-muted">{t('budget.empty')}</p>
          <Link to="/budgets" className="text-primary hover:text-primary-hover touch-hit">{t('budget.emptyAction')}</Link>
        </div>
      ) : budget.cadence === 'custom' ? (
        <p className="text-sm text-text-muted">{t('budget.customCadence')}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">{currentPeriod?.name}</p>
          {totals.map(([code, tot]) => (
            <p key={code} className="font-mono text-sm text-text">
              {t('budget.spentOf', { spent: formatAmount(tot.actual), planned: formatAmount(tot.planned) })}
              {multiCurrency ? ` ${code}` : ''}
            </p>
          ))}
          <p className="text-[10px] font-mono uppercase tracking-wider text-text-muted">{t('budget.attention')}</p>
          {attention.length === 0 ? (
            <p className="text-sm text-text-muted">{t('budget.allOnTrack')}</p>
          ) : (
            attention.map(({ item, pct, over }) => (
              <Link
                key={`${item.category_id}-${item.currency_code}`}
                to={`/transactions?category=${item.category_id}&from=${currentPeriod!.start_date}&to=${currentPeriod!.end_date}`}
                className="block rounded-sm hover:bg-surface-hover transition-colors px-1.5 -mx-1.5"
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="text-xs font-medium text-text truncate">{item.category_name}</span>
                  <span className="font-mono text-xs tabular-nums text-text whitespace-nowrap">
                    {formatAmount(item.actual)} <span className="text-[10px] text-text-muted">{t('budget.of')} {formatAmount(item.planned)}</span>
                  </span>
                </div>
                {/* Budget category bars: sharp corners; severity lives on the
                    fill - over = bg-negative, 75%+ = bg-warning. */}
                <div className="w-full h-1 bg-surface-muted rounded-none overflow-hidden mb-1">
                  <div
                    className={`h-full rounded-none ${over ? 'bg-negative' : 'bg-warning'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono uppercase tracking-wider">
                  <span className={over ? 'text-negative' : 'text-text-muted'}>
                    {over ? t('budget.statusOver') : t('budget.statusNearLimit')}
                  </span>
                  <span className="text-text-muted">{Math.round(pct)}%</span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  )
}
