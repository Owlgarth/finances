import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowLeft, ArrowUp, CalendarRange, ChevronLeft, ChevronRight, Merge, Pencil, Plus, Check, Settings2, Trash2, X } from 'lucide-react'
import { budgetsApi, reportsApi } from '../api/client'
import type { Period } from '../types'
import { useEnabledCurrencies } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { intParam } from '../utils/params'
import Modal from '../components/common/Modal'
import Select from '../components/common/Select'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import PeriodFormModal from '../components/modals/budgets/PeriodFormModal'
import PeriodPicker from '../components/budgets/PeriodPicker'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

// Per-budget currency-switcher order — a display preference, stored client-side
// like the theme ('owlgarth_theme'), keyed per budget since currency sets differ.
const currencyOrderKey = (budgetId: number) => `owlgarth_currency_order:${budgetId}`

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
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite, canManageAccounts } = usePermissions()
  const { data: currencies = [] } = useEnabledCurrencies()

  const { data: budget } = useQuery({ queryKey: ['budget', budgetId], queryFn: () => budgetsApi.get(budgetId) })
  const { data: periods = [], isSuccess: periodsLoaded } = useQuery({
    queryKey: ['periods', budgetId],
    queryFn: () => budgetsApi.listPeriods(budgetId),
    // Cross-tab convergence — same rationale as the useDomain list hooks.
    refetchOnWindowFocus: 'always',
  })

  const [periodId, setPeriodId] = useState<number | null>(null)

  // ?period= deep-link seed, as a latest-ref. The sync effect MUST stay
  // declared BEFORE the [budgetId] reset effect below: React runs effects in
  // declaration order, so on mount and on budget-to-budget navigation the
  // ref already holds the NEW URL's value when the reset effect reads it
  // (declared after, it would read the previous URL's value: deep links
  // wiped on mount, the old budget's period id seeded on budget switches).
  // The useRef initializer covers the very first read; render-time ref
  // WRITES are illegal under react-hooks/refs - this effect-synced shape is
  // the sanctioned one.
  const periodParamRef = useRef<number | null>(intParam(searchParams, 'period'))
  useEffect(() => {
    periodParamRef.current = intParam(searchParams, 'period')
  }, [searchParams])

  // Default to the current period (materialize it lazily on load). The
  // enabled gate must wait for the budget to LOAD, not just be non-custom:
  // on the first render(s) budget is undefined, `undefined !== 'custom'` is
  // true, and custom-cadence budgets fire a doomed GET periods/current ->
  // 400 -> console error noise on every visit to an empty custom budget.
  const { data: currentPeriod, isSuccess: currentPeriodLoaded } = useQuery({
    queryKey: ['current-period', budgetId],
    queryFn: () => budgetsApi.currentPeriod(budgetId),
    enabled: budget != null && budget.cadence !== 'custom',
    retry: false,
  })
  // The periods list is a plain GET, newest first — it beats the lazily
  // materialized current-period fetch. Don't let periods[0] (the NEWEST
  // period) win that race and open planners on a future period. Custom
  // cadence has no derived current period, so there the list is all there is.
  const currentPeriodKnown = budget?.cadence === 'custom' || currentPeriodLoaded

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

  // Summary gate (declared after the allPeriods memo - TDZ): on budget-to-
  // budget navigation the [budgetId] reset effect runs one commit later than
  // this render, so periodId still holds the PREVIOUS budget's period for a
  // single render. Without the gate that render fires budgetSummary(B,
  // A_period) -> a transient red 404 in the network tab (the reset then
  // clears the id and the UI recovers, but the stray request is noise).
  // Gating on membership in allPeriods also keeps a garbage ?period= seed
  // from hitting the server at all - the reconcile effect clears it locally.
  // A derived const, not state: zero set-state-in-effect cost.
  const summaryPeriodId = allPeriods.some((p) => p.id === periodId) ? periodId : undefined
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['budget-summary', budgetId, summaryPeriodId],
    queryFn: () => reportsApi.budgetSummary(budgetId, summaryPeriodId!),
    enabled: summaryPeriodId != null,
  })

  // Default the selection and reconcile URL seeds. Declared AFTER the
  // allPeriods memo (referencing allPeriods from the old position, above its
  // declaration, is a TDZ ReferenceError in the deps array) and BEFORE the
  // [budgetId] reset effect (so the reset effect's setPeriodId lands last on
  // mount - a seeded param beats this effect's auto-pick when react-query
  // cache makes currentPeriod available in the first commit).
  useEffect(() => {
    if (periodId === null && currentPeriod) setPeriodId(currentPeriod.id)
    else if (periodId === null && currentPeriodKnown && periods.length > 0) setPeriodId(periods[0].id)
    // Reconcile: a seeded ?period= that no authoritative list contains (typo,
    // stale bookmark, another budget's id) clears so the auto-pick branches
    // above take over. periodsLoaded + currentPeriodKnown gate the "the list
    // is authoritative" premise: for non-custom budgets a VALID seed may
    // equal the lazily-materialized current period that is not in the periods
    // list yet - clearing before currentPeriodKnown would transiently wipe a
    // valid seed while the two queries race. Never writes the URL
    // (user-initiated writes only).
    else if (periodId !== null && periodsLoaded && currentPeriodKnown && !allPeriods.some((p) => p.id === periodId)) setPeriodId(null)
  }, [currentPeriod, periods, periodId, currentPeriodKnown, periodsLoaded, allPeriods])

  // URL write side - event handlers and mutation callbacks ONLY (picker
  // onChange, goToPeriod, deletePeriod). Functional setSearchParams preserves
  // any other params (same shape as createUpdateParams in utils/params.ts);
  // replace keeps selections out of history. The auto-pick and reconcile
  // branches above NEVER write.
  const writePeriodParam = (id: number | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id === null) next.delete('period')
        else next.set('period', String(id))
        return next
      },
      { replace: true },
    )
  }
  const selectPeriod = (id: number) => {
    setPeriodId(id)
    writePeriodParam(id)
  }

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

  // Custom-cadence period management. `nonce` forces a keyed remount of
  // PeriodFormModal per open session so its lazy state initializers re-run —
  // edit prefill and add-mode defaults with zero open-effects.
  const [periodModal, setPeriodModal] = useState<{ mode: 'add' | 'edit'; period: Period | null; nonce: number } | null>(null)
  const [deletingPeriod, setDeletingPeriod] = useState<Period | null>(null)
  const openPeriodModal = (mode: 'add' | 'edit', period: Period | null = null) =>
    setPeriodModal({ mode, period, nonce: Date.now() })

  const deletePeriod = useMutation({
    mutationFn: (id: number) => budgetsApi.deletePeriod(budgetId, id),
    onSuccess: async (_result, deletedId) => {
      // Await the periods refetch BEFORE clearing the selection: the null-picker
      // effect (above) picks periods[0] from whatever list it sees — picking
      // from a stale list could re-select the just-deleted id (ghost periodId →
      // selectedPeriod null → dead page). After the await, the re-render reads
      // the fresh cache.
      await queryClient.invalidateQueries({ queryKey: ['periods', budgetId] })
      queryClient.invalidateQueries({ queryKey: ['budget-summary', budgetId] })
      queryClient.invalidateQueries({ queryKey: ['budget-history', budgetId] })
      toast.success('Period deleted')
      // Category selection is period-independent - leave selectedCategory alone.
      if (deletedId === periodId) {
        // Param clear is safe here: mutation onSuccess is a callback, not an
        // effect - no lint cost, and the awaited refetch above guarantees the
        // auto-pick re-selects from the fresh list (not the just-deleted id).
        setPeriodId(null)
        writePeriodParam(null)
      }
      setDeletingPeriod(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete period'))
      setDeletingPeriod(null)
    },
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
      writePeriodParam(target.id)
      return
    }
    if (dir === 1 && canPlanAhead && selectedPeriod) {
      setIsPlanningNext(true)
      try {
        const next = await budgetsApi.currentPeriod(budgetId, nextDayIso(selectedPeriod.end_date))
        await queryClient.invalidateQueries({ queryKey: ['periods', budgetId] })
        setPeriodId(next.id)
        writePeriodParam(next.id)
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
    // Seed from ?period= (deep link / reload) instead of resetting to null.
    // The ref-sync effect declared above has already run for this commit, so
    // the ref holds THIS URL's value (null when no param). Sanctioned
    // extension of an already-flagged effect - no new warning.
    setPeriodId(periodParamRef.current)
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
              <PeriodPicker
                periods={allPeriods}
                value={periodId}
                onChange={selectPeriod}
                limit={7}
                onViewAll={() => navigate(`/budgets/${budgetId}/periods`)}
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
            {budget?.cadence === 'custom' && canManageAccounts && (
              <>
                {/* Divider between period navigation and period management
                    (patterns.md §5 group divider, vertical form). Also keeps
                    the chevrons' touch-hit areas clear of these buttons'. */}
                <span className="w-px h-4 bg-border mx-1" aria-hidden="true" />
                {/* Adjacent icon buttons (BudgetsPage pattern): real padded hit
                    areas instead of .touch-hit (expanded areas would overlap —
                    responsive.md); §3 restores the hover bg the card buttons
                    omit, and rounded-none for icon-only. */}
                <button
                  type="button"
                  onClick={() => openPeriodModal('add')}
                  title="Add period"
                  aria-label="Add period"
                  className="flex items-center justify-center p-1.5 rounded-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                >
                  <Plus size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => selectedPeriod && openPeriodModal('edit', selectedPeriod)}
                  disabled={!selectedPeriod}
                  title={selectedPeriod ? `Edit period ${selectedPeriod.name}` : 'Edit period'}
                  aria-label={selectedPeriod ? `Edit period ${selectedPeriod.name}` : 'Edit period'}
                  className="flex items-center justify-center p-1.5 rounded-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => selectedPeriod && setDeletingPeriod(selectedPeriod)}
                  disabled={!selectedPeriod}
                  title={selectedPeriod ? `Delete period ${selectedPeriod.name}` : 'Delete period'}
                  aria-label={selectedPeriod ? `Delete period ${selectedPeriod.name}` : 'Delete period'}
                  className="flex items-center justify-center p-1.5 rounded-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 text-text-muted hover:text-negative hover:bg-negative-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {isPast && (
        <p className="text-xs text-warning mb-3">Viewing a past period — a historical plan-vs-actual snapshot.</p>
      )}
      {isFuture && (
        <p className="text-xs text-text-muted mb-3">Planning ahead — actuals will appear once this period starts.</p>
      )}

      {budget?.cadence === 'custom' && periods.length === 0 ? (
        /* Custom budget with no periods: nothing to summarize or plan — the
           designed empty state (patterns.md §2 "Periods" row) replaces the
           ledger. Non-admins see the message without the CTA. */
        <EmptyState
          icon={<CalendarRange size={48} strokeWidth={1.5} className="text-text-muted/30" />}
          heading="No budget periods"
          message="Create a period to start budgeting."
          action={canManageAccounts ? { label: 'Add period', onClick: () => openPeriodModal('add') } : undefined}
        />
      ) : summaryLoading ? (
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

      {periodModal && (
        <PeriodFormModal
          key={`${periodModal.mode}-${periodModal.period?.id ?? 'new'}-${periodModal.nonce}`}
          mode={periodModal.mode}
          budgetId={budgetId}
          period={periodModal.period}
          onClose={() => setPeriodModal(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deletingPeriod}
        title="Delete period"
        message={`Delete "${deletingPeriod?.name}"? Its planned amounts will be deleted. Transactions are not affected. This cannot be undone.`}
        onConfirm={() => deletingPeriod && deletePeriod.mutate(deletingPeriod.id)}
        onCancel={() => setDeletingPeriod(null)}
        isPending={deletePeriod.isPending}
      />
    </div>
  )
}
