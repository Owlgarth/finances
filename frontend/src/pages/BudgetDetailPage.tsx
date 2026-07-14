import { Fragment, useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Check, X } from 'lucide-react'
import { budgetsApi, reportsApi } from '../api/client'
import type { Period } from '../types'
import { useEnabledCurrencies } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import Select from '../components/common/Select'
import { inputClass, primaryButtonClass } from '../components/common/formStyles'

/** The day after an ISO date, as an ISO date (local, no TZ shifts). */
function nextDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

export default function BudgetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const budgetId = Number(id)
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const { data: currencies = [] } = useEnabledCurrencies()

  const { data: budget } = useQuery({ queryKey: ['budget', budgetId], queryFn: () => budgetsApi.get(budgetId) })
  const { data: periods = [] } = useQuery({ queryKey: ['periods', budgetId], queryFn: () => budgetsApi.listPeriods(budgetId) })

  const [periodId, setPeriodId] = useState<number | null>(null)

  // Default to the current period (materialize it lazily on load).
  const { data: currentPeriod } = useQuery({
    queryKey: ['current-period', budgetId],
    queryFn: () => budgetsApi.currentPeriod(budgetId),
    enabled: budget?.cadence !== 'custom',
    retry: false,
  })
  useEffect(() => {
    if (periodId === null && currentPeriod) setPeriodId(currentPeriod.id)
    else if (periodId === null && periods.length > 0) setPeriodId(periods[0].id)
  }, [currentPeriod, periods, periodId])

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['budget-summary', budgetId, periodId],
    queryFn: () => reportsApi.budgetSummary(budgetId, periodId!),
    enabled: !!periodId,
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => budgetsApi.listCategories(budgetId),
  })

  const allPeriods = useMemo(() => {
    const map = new Map<number, Period>()
    periods.forEach((p) => map.set(p.id, p))
    if (currentPeriod) map.set(currentPeriod.id, currentPeriod)
    return Array.from(map.values()).sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  }, [periods, currentPeriod])

  const primaryCurrency = currencies[0]?.code ?? 'PLN'

  const [newCategory, setNewCategory] = useState('')
  const addCategory = useMutation({
    mutationFn: () => budgetsApi.createCategory(budgetId, { name: newCategory.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', budgetId] })
      setNewCategory('')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to add category')),
  })

  const setAmount = useMutation({
    mutationFn: ({ categoryId, amount, currencyCode }: { categoryId: number; amount: string; currencyCode: string }) =>
      budgetsApi.setCategoryBudget(budgetId, periodId!, { category_id: categoryId, currency_code: currencyCode, amount }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget-summary', budgetId, periodId] }),
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to set amount')),
  })

  // Editing key: `${categoryId}:${currencyCode}` — one editable planned cell per currency.
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [cellValue, setCellValue] = useState('')

  const selectedPeriod = allPeriods.find((p) => p.id === periodId) ?? null
  const todayIso = new Date().toISOString().slice(0, 10)
  const isPast = !!selectedPeriod && selectedPeriod.end_date < todayIso
  const isFuture = !!selectedPeriod && selectedPeriod.start_date > todayIso
  // Current and future periods are editable; past periods are immutable history.
  const canEditPlan = canWrite && !!periodId && !isPast

  // Chronological navigation; stepping past the newest period materializes the next one.
  const ascPeriods = useMemo(
    () => [...allPeriods].sort((a, b) => (a.start_date < b.start_date ? -1 : 1)),
    [allPeriods],
  )
  const selectedIdx = ascPeriods.findIndex((p) => p.id === periodId)
  const canPlanAhead = budget?.cadence !== 'custom'
  const hasPrev = selectedIdx > 0
  const hasNext = selectedIdx >= 0 && (selectedIdx < ascPeriods.length - 1 || canPlanAhead)
  const [isPlanningNext, setIsPlanningNext] = useState(false)

  const goToPeriod = async (dir: 1 | -1) => {
    if (selectedIdx < 0) return
    const target = ascPeriods[selectedIdx + dir]
    if (target) {
      setPeriodId(target.id)
      return
    }
    if (dir === 1 && canPlanAhead && selectedPeriod) {
      setIsPlanningNext(true)
      try {
        const next = await budgetsApi.currentPeriod(budgetId, nextDayIso(selectedPeriod.end_date))
        await queryClient.invalidateQueries({ queryKey: ['periods', budgetId] })
        setPeriodId(next.id)
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Failed to open the next period'))
      } finally {
        setIsPlanningNext(false)
      }
    }
  }

  const items = useMemo(() => summary?.items ?? [], [summary])

  // Currency column groups: every currency present in the summary (enabled-currency
  // order first), falling back to the primary currency for an empty period.
  const activeCurrencies = useMemo(() => {
    const present = new Set(items.map((i) => i.currency_code))
    const ordered = currencies.map((c) => c.code).filter((code) => present.has(code))
    for (const code of present) {
      if (!ordered.includes(code)) ordered.push(code)
    }
    return ordered.length > 0 ? ordered : [primaryCurrency]
  }, [items, currencies, primaryCurrency])
  const multiCurrency = activeCurrencies.length > 1

  // Rows: one per active category, with planned/actual/remaining per currency.
  const rows = categories
    .filter((c) => !c.is_archived)
    .map((c) => ({
      category: c,
      cells: activeCurrencies.map((code) => {
        const item = items.find((i) => i.category_id === c.id && i.currency_code === code)
        return {
          currencyCode: code,
          planned: item?.planned ?? '0',
          actual: item?.actual ?? '0',
          remaining: item?.remaining ?? '0',
        }
      }),
    }))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/budgets" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text mb-4">
        <ArrowLeft size={13} /> Budgets
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">{budget?.name ?? 'Budget'}</h1>
        {allPeriods.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToPeriod(-1)}
              disabled={!hasPrev}
              aria-label="Previous period"
              className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="w-56">
              <Select
                value={periodId}
                onChange={setPeriodId}
                options={allPeriods.map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Select period"
                aria-label="Period"
              />
            </div>
            <button
              type="button"
              onClick={() => goToPeriod(1)}
              disabled={!hasNext || isPlanningNext}
              aria-label="Next period"
              title={selectedIdx === ascPeriods.length - 1 && canPlanAhead ? 'Plan the next period' : undefined}
              className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {isPast && (
        <p className="text-xs text-warning mb-3">Viewing a past period — a historical plan-vs-actual snapshot.</p>
      )}
      {isFuture && (
        <p className="text-xs text-text-muted mb-3">Planning ahead — actuals will appear once this period starts.</p>
      )}

      {summaryLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : (
        <div className="border border-border rounded-sm bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {multiCurrency && (
                <tr className="text-[9px] font-mono uppercase tracking-widest text-text-muted border-b border-border">
                  <th />
                  {activeCurrencies.map((code) => (
                    <th key={code} colSpan={3} className="text-center px-4 py-2 border-l border-border">{code}</th>
                  ))}
                </tr>
              )}
              <tr className="text-[9px] font-mono uppercase tracking-widest text-text-muted border-b border-border">
                <th className="text-left px-4 py-2">Category</th>
                {activeCurrencies.map((code) => (
                  <Fragment key={code}>
                    <th className={`text-right px-4 py-2 ${multiCurrency ? 'border-l border-border' : ''}`}>Planned</th>
                    <th className="text-right px-4 py-2">Actual</th>
                    <th className="text-right px-4 py-2">Remaining</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ category, cells }) => (
                <tr key={category.id}>
                  <td className="px-4 py-2 text-text whitespace-nowrap">{category.name}</td>
                  {cells.map(({ currencyCode, planned, actual, remaining }) => {
                    const cellKey = `${category.id}:${currencyCode}`
                    return (
                      <Fragment key={currencyCode}>
                        <td className={`px-4 py-2 text-right font-mono ${multiCurrency ? 'border-l border-border' : ''}`}>
                          {editingCell === cellKey ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                step="0.01"
                                value={cellValue}
                                onChange={(e) => setCellValue(e.target.value)}
                                className="w-24 bg-surface-hover border border-border rounded-none px-2 py-1 font-mono text-xs text-text focus:ring-2 focus:ring-border-focus focus:outline-none"
                                autoFocus
                              />
                              <button onClick={() => { setAmount.mutate({ categoryId: category.id, amount: cellValue || '0', currencyCode }); setEditingCell(null) }} className="text-positive"><Check size={14} /></button>
                              <button onClick={() => setEditingCell(null)} className="text-text-muted"><X size={14} /></button>
                            </span>
                          ) : canEditPlan ? (
                            <button onClick={() => { setEditingCell(cellKey); setCellValue(planned) }} className="hover:text-primary">
                              {formatAmount(planned)}
                            </button>
                          ) : (
                            formatAmount(planned)
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-text-muted">{formatAmount(actual)}</td>
                        <td className={`px-4 py-2 text-right font-mono ${parseFloat(remaining) < 0 ? 'text-negative' : 'text-text'}`}>
                          {formatAmount(remaining)}
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={1 + activeCurrencies.length * 3} className="px-4 py-6 text-center text-text-muted">No categories yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (newCategory.trim()) addCategory.mutate() }}
          className="mt-4 flex items-center gap-2 max-w-sm"
        >
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" className={inputClass} />
          <button type="submit" className={primaryButtonClass}><Plus size={13} /></button>
        </form>
      )}
    </div>
  )
}
