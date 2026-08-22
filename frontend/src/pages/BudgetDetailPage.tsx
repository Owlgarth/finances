import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight, Merge, Plus, Check, Settings2, X } from 'lucide-react'
import { budgetsApi, reportsApi } from '../api/client'
import type { Period } from '../types'
import { useEnabledCurrencies } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import Modal from '../components/common/Modal'
import Select from '../components/common/Select'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

// Per-budget currency-switcher order — a display preference, stored client-side
// like the theme ('denarly_theme'), keyed per budget since currency sets differ.
const currencyOrderKey = (budgetId: number) => `denarly_currency_order:${budgetId}`

function loadCurrencyOrder(budgetId: number): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(currencyOrderKey(budgetId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : []
  } catch {
    return []
  }
}

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
  const { data: currentPeriod, isSuccess: currentPeriodLoaded } = useQuery({
    queryKey: ['current-period', budgetId],
    queryFn: () => budgetsApi.currentPeriod(budgetId),
    enabled: budget?.cadence !== 'custom',
    retry: false,
  })
  // The periods list is a plain GET, newest first — it beats the lazily
  // materialized current-period fetch. Don't let periods[0] (the NEWEST
  // period) win that race and open planners on a future period. Custom
  // cadence has no derived current period, so there the list is all there is.
  const currentPeriodKnown = budget?.cadence === 'custom' || currentPeriodLoaded
  useEffect(() => {
    if (periodId === null && currentPeriod) setPeriodId(currentPeriod.id)
    else if (periodId === null && currentPeriodKnown && periods.length > 0) setPeriodId(periods[0].id)
  }, [currentPeriod, periods, periodId, currentPeriodKnown])

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

  // Zero enabled currencies (shouldn't happen) — '—' can't pose as a real code;
  // it's never rendered (single-currency layouts show no switcher).
  const primaryCurrency = currencies[0]?.code ?? '—'

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

  // Row/card highlight — click toggles it. Besides the visual "where was I
  // looking" marker, the selected category is the target of the merge flow.
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const toggleSelected = (id: number) => setSelectedCategory((prev) => (prev === id ? null : id))

  // Merge flow: fold another category (source) into the selected one (target).
  const selectedCategoryObj = categories.find((c) => c.id === selectedCategory) ?? null
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null)
  const mergeCategory = useMutation({
    mutationFn: (sourceId: number) => budgetsApi.mergeCategory(budgetId, selectedCategory!, sourceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', budgetId] })
      queryClient.invalidateQueries({ queryKey: ['workspace-categories'] })
      queryClient.invalidateQueries({ queryKey: ['budget-summary', budgetId] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success('Categories merged')
      setMergeOpen(false)
      setMergeSourceId(null)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to merge categories')),
  })

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

  // Saved switcher order for this budget; empty = enabled-currency order.
  const [currencyOrder, setCurrencyOrder] = useState<string[]>(() => loadCurrencyOrder(budgetId))
  // Budget→budget navigation (CommandPalette) re-renders this page with a new
  // budgetId. Reset the other per-budget state too, or the summary query runs
  // budgetSummary(B, A_period) → 404 → every row silently renders 0s. Kept in
  // this same effect (not a new one) so the set-state-in-effect warning count
  // stays put — the rule flags once per effect, not per call.
  useEffect(() => {
    setCurrencyOrder(loadCurrencyOrder(budgetId))
    setPeriodId(null)
    setSelectedCategory(null)
  }, [budgetId])

  // Currency column groups: every currency present in the summary (enabled-currency
  // order first), falling back to the primary currency for an empty period. The
  // saved switcher order wins where set; unordered currencies keep their place
  // after the ordered ones (stable sort). First in the result = default view.
  const activeCurrencies = useMemo(() => {
    const present = new Set(items.map((i) => i.currency_code))
    const ordered = currencies.map((c) => c.code).filter((code) => present.has(code))
    for (const code of present) {
      if (!ordered.includes(code)) ordered.push(code)
    }
    const rank = new Map(currencyOrder.map((code, i) => [code, i]))
    ordered.sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER))
    return ordered.length > 0 ? ordered : [primaryCurrency]
  }, [items, currencies, primaryCurrency, currencyOrder])
  const multiCurrency = activeCurrencies.length > 1

  // Currency carousel: one currency's Planned/Actual/Remaining at a time.
  // Tracked by code, not index, so the view survives a period change; when the
  // selected currency isn't present in the new period, fall back to the first.
  const [viewCurrency, setViewCurrency] = useState<string | null>(null)
  const currencyIdx = viewCurrency ? Math.max(0, activeCurrencies.indexOf(viewCurrency)) : 0
  const activeCurrency = activeCurrencies[currencyIdx]

  const goToCurrency = (dir: 1 | -1) => {
    const len = activeCurrencies.length
    setViewCurrency(activeCurrencies[(currencyIdx + dir + len) % len])
    setEditingCell(null)
  }

  // Switcher-order config: each move persists the full current arrangement,
  // so the saved order always covers every currency the user has seen.
  const [orderConfigOpen, setOrderConfigOpen] = useState(false)
  const moveCurrency = (idx: number, dir: 1 | -1) => {
    const target = idx + dir
    if (target < 0 || target >= activeCurrencies.length) return
    const next = [...activeCurrencies]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setCurrencyOrder(next)
    localStorage.setItem(currencyOrderKey(budgetId), JSON.stringify(next))
    // With no explicit selection the first currency is shown, so a reorder can
    // switch the visible currency — don't leave an editor open across that.
    setEditingCell(null)
  }

  // Shared between the desktop table header and the mobile card list header.
  const currencySwitcher = multiCurrency && (
    <div className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => goToCurrency(-1)}
        aria-label="Previous currency"
        className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-surface-hover hover:text-text transition-colors touch-hit"
      >
        <ChevronLeft size={12} />
      </button>
      <span aria-live="polite" className="min-w-[6ch] text-center text-text">
        {activeCurrency}
        <span className="ml-1.5 text-text-muted">{currencyIdx + 1}/{activeCurrencies.length}</span>
      </span>
      <button
        type="button"
        onClick={() => goToCurrency(1)}
        aria-label="Next currency"
        className="w-7 h-7 flex items-center justify-center rounded-sm hover:bg-surface-hover hover:text-text transition-colors touch-hit"
      >
        <ChevronRight size={12} />
      </button>
      <button
        type="button"
        onClick={() => setOrderConfigOpen(true)}
        aria-label="Configure currency order"
        className="w-7 h-7 ml-1 flex items-center justify-center rounded-sm hover:bg-surface-hover hover:text-text transition-colors touch-hit"
      >
        <Settings2 size={12} />
      </button>
    </div>
  )

  // Rows: one per active category, with planned/actual/remaining for the
  // currency currently shown.
  const rows = categories
    .filter((c) => !c.is_archived)
    .map((c) => {
      const item = items.find((i) => i.category_id === c.id && i.currency_code === activeCurrency)
      return {
        category: c,
        planned: item?.planned ?? '0',
        actual: item?.actual ?? '0',
        remaining: item?.remaining ?? '0',
      }
    })

  return (
    <div className="p-6 max-sm:p-0 max-w-4xl mx-auto">
      <Link to="/budgets" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text mb-4 max-sm:min-h-[44px]">
        <ArrowLeft size={13} /> Budgets
      </Link>

      {/* Mobile: title first line, period switcher wraps to a full-width row below. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-lg font-semibold text-text">{budget?.name ?? 'Budget'}</h1>
        {allPeriods.length > 0 && (
          <div className="flex items-center gap-1 max-sm:w-full">
            <button
              type="button"
              onClick={() => goToPeriod(-1)}
              disabled={!hasPrev}
              aria-label="Previous period"
              className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-hit"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="w-56 max-sm:w-auto max-sm:flex-1">
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
              className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-hit"
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
        <>
        {/* Desktop: ledger table. Hidden on mobile in favor of the card list below. */}
        <div className="border border-border rounded-sm bg-surface overflow-x-auto max-sm:hidden">
          <table className="w-full text-sm">
            <thead>
              {multiCurrency && (
                <tr className="text-[9px] font-mono uppercase tracking-widest text-text-muted border-b border-border">
                  <th className="sticky left-0 z-10 bg-surface" />
                  <th colSpan={3} className="px-4 py-1 font-medium">
                    {currencySwitcher}
                  </th>
                </tr>
              )}
              <tr className="text-[9px] font-mono uppercase tracking-widest text-text-muted border-b border-border">
                {/* Sticky: row identity stays put while amount columns scroll (S3). */}
                <th className="text-left px-4 py-2 sticky left-0 z-10 bg-surface">Category</th>
                <th className="text-right px-4 py-2">Planned</th>
                <th className="text-right px-4 py-2">Actual</th>
                <th className="text-right px-4 py-2">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ category, planned, actual, remaining }) => {
                const cellKey = `${category.id}:${activeCurrency}`
                const isSelected = selectedCategory === category.id
                return (
                  <tr
                    key={category.id}
                    tabIndex={0}
                    onClick={() => toggleSelected(category.id)}
                    onKeyDown={(e) => {
                      // Same guard as the mobile cards: only when the row itself
                      // is focused — Enter/Space inside the planned editor and its
                      // buttons must keep their native behavior.
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        toggleSelected(category.id)
                      }
                    }}
                    className={`cursor-pointer ${isSelected ? 'bg-surface-hover' : ''}`}
                  >
                    {/* Sticky cell needs its own solid bg, so it mirrors the row state;
                        the inset shadow is the selection accent bar. */}
                    <td className={`px-4 py-2 text-text whitespace-nowrap sticky left-0 z-10 max-sm:max-w-[9rem] overflow-hidden text-ellipsis ${isSelected ? 'bg-surface-hover shadow-[inset_2px_0_0_var(--color-border-focus)]' : 'bg-surface'}`}>
                      {category.name}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-planned">
                      {editingCell === cellKey ? (
                        <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            className="w-24 bg-surface-hover border border-border rounded-none px-2 py-1 font-mono text-xs text-text focus:ring-2 focus:ring-border-focus focus:outline-none"
                            autoFocus
                          />
                          <button onClick={() => { setAmount.mutate({ categoryId: category.id, amount: cellValue || '0', currencyCode: activeCurrency }); setEditingCell(null) }} aria-label="Save planned amount" className="text-positive touch-hit"><Check size={14} /></button>
                          <button onClick={() => setEditingCell(null)} aria-label="Cancel" className="text-text-muted touch-hit"><X size={14} /></button>
                        </span>
                      ) : canEditPlan ? (
                        /* Whole cell is the tap target, not just the digits. */
                        <button onClick={(e) => { e.stopPropagation(); setEditingCell(cellKey); setCellValue(planned) }} className="hover:text-primary w-full text-right">
                          {formatAmount(planned)}
                        </button>
                      ) : (
                        formatAmount(planned)
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-actual">{formatAmount(actual)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${parseFloat(remaining) < 0 ? 'text-negative' : 'text-remaining'}`}>
                      {formatAmount(remaining)}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-text-muted">No categories yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: card per category — full-width numbers so thousands stay legible. */}
        <div className="sm:hidden space-y-2">
          {multiCurrency && (
            <div className="text-[9px] font-mono uppercase tracking-widest text-text-muted py-0.5">
              {currencySwitcher}
            </div>
          )}
          {rows.map(({ category, planned, actual, remaining }) => {
            const cellKey = `${category.id}:${activeCurrency}`
            const isSelected = selectedCategory === category.id
            return (
              <div
                key={category.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => toggleSelected(category.id)}
                onKeyDown={(e) => {
                  // Only when the card itself is focused — Enter/Space inside the
                  // planned editor must keep their native behavior.
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    toggleSelected(category.id)
                  }
                }}
                className={`border rounded-sm bg-surface cursor-pointer transition-colors ${isSelected ? 'border-border-focus' : 'border-border'}`}
              >
                <div className={`px-4 py-2 border-b text-sm font-medium text-text text-center truncate ${isSelected ? 'border-border-focus' : 'border-border'}`}>
                  {category.name}
                </div>
                <div className="grid grid-cols-3 divide-x divide-border text-center">
                  <div className="px-2 py-2 min-w-0">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-text-muted mb-1">Planned</div>
                    {editingCell === cellKey ? (
                      <div className="flex flex-col items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={cellValue}
                          onChange={(e) => setCellValue(e.target.value)}
                          className="w-full bg-surface-hover border border-border rounded-none px-2 py-1 font-mono text-base text-text focus:ring-2 focus:ring-border-focus focus:outline-none"
                          autoFocus
                        />
                        <div className="flex items-center gap-5">
                          <button onClick={() => { setAmount.mutate({ categoryId: category.id, amount: cellValue || '0', currencyCode: activeCurrency }); setEditingCell(null) }} aria-label="Save planned amount" className="text-positive touch-hit"><Check size={16} /></button>
                          <button onClick={() => setEditingCell(null)} aria-label="Cancel" className="text-text-muted touch-hit"><X size={16} /></button>
                        </div>
                      </div>
                    ) : canEditPlan ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingCell(cellKey); setCellValue(planned) }}
                        className="w-full min-h-[36px] font-mono text-sm text-planned hover:text-primary truncate touch-hit"
                      >
                        {formatAmount(planned)}
                      </button>
                    ) : (
                      <div className="min-h-[36px] flex items-center justify-center font-mono text-sm text-planned truncate">
                        {formatAmount(planned)}
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-2 min-w-0">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-text-muted mb-1">Actual</div>
                    <div className="min-h-[36px] flex items-center justify-center font-mono text-sm text-actual truncate">
                      {formatAmount(actual)}
                    </div>
                  </div>
                  <div className="px-2 py-2 min-w-0">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-text-muted mb-1">Remaining</div>
                    <div className={`min-h-[36px] flex items-center justify-center font-mono text-sm truncate ${parseFloat(remaining) < 0 ? 'text-negative' : 'text-remaining'}`}>
                      {formatAmount(remaining)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {rows.length === 0 && (
            <div className="border border-border rounded-sm bg-surface px-4 py-6 text-center text-sm text-text-muted">
              No categories yet.
            </div>
          )}
        </div>
        </>
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

      {canWrite && selectedCategoryObj && categories.length > 1 && (
        <button
          type="button"
          onClick={() => { setMergeSourceId(null); setMergeOpen(true) }}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors touch-hit"
        >
          <Merge size={13} /> Merge another category into “{selectedCategoryObj.name}”…
        </button>
      )}

      <Modal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        size="sm"
        className="p-6"
        title="Merge categories"
      >
        <p className="text-xs text-text-muted -mt-3 mb-4">
          All transactions, planned transactions and planned amounts of the category you pick will
          move to “{selectedCategoryObj?.name}”, and the picked category will be deleted. Planned
          amounts for the same period are added together. This cannot be undone.
        </p>
        <div className="mb-4">
          <label className={labelClass}>Category to merge in</label>
          <Select
            value={mergeSourceId}
            onChange={setMergeSourceId}
            options={categories
              .filter((c) => c.id !== selectedCategory)
              .map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Select category"
            aria-label="Category to merge in"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setMergeOpen(false)} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { if (mergeSourceId != null) mergeCategory.mutate(mergeSourceId) }}
            disabled={mergeSourceId == null || mergeCategory.isPending}
            className={primaryButtonClass}
          >
            {mergeCategory.isPending ? 'Merging…' : 'Merge'}
          </button>
        </div>
      </Modal>

      <Modal
        open={orderConfigOpen}
        onClose={() => setOrderConfigOpen(false)}
        size="sm"
        className="p-6"
        title="Currency order"
      >
        <p className="text-xs text-text-muted -mt-3 mb-4">
          The switcher cycles through currencies in this order; the first one is shown by default.
        </p>
        <ul className="border border-border rounded-sm divide-y divide-border">
          {activeCurrencies.map((code, idx) => (
            <li key={code} className="flex items-center justify-between px-3 py-2">
              <span className="text-sm text-text">
                <span className="font-mono">{code}</span>
                <span className="ml-2 text-xs text-text-muted">
                  {currencies.find((c) => c.code === code)?.name ?? ''}
                </span>
                {idx === 0 && (
                  <span className="ml-2 text-[9px] font-mono uppercase tracking-widest text-text-muted">Default</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveCurrency(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${code} up`}
                  className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-hit"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveCurrency(idx, 1)}
                  disabled={idx === activeCurrencies.length - 1}
                  aria-label={`Move ${code} down`}
                  className="w-7 h-7 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-hit"
                >
                  <ArrowDown size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
