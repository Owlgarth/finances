import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarRange, ChevronLeft, ChevronRight, Merge, Pencil, Plus, Check, Tags, Trash2, X } from 'lucide-react'
import { budgetsApi, reportsApi } from '../api/client'
import type { Period } from '../types'
import { useEnabledCurrencies } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { activeCurrencyCodes } from '../utils/currencies'
import { getApiErrorMessage } from '../utils/errors'
import { intParam } from '../utils/params'
import Modal from '../components/common/Modal'
import Select from '../components/common/Select'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import PeriodFormModal from '../components/modals/budgets/PeriodFormModal'
import ManageCategoriesModal from '../components/modals/budgets/ManageCategoriesModal'
import PeriodPicker from '../components/budgets/PeriodPicker'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

/** The day after an ISO date, as an ISO date (local, no TZ shifts). */
function nextDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

/** The period nearest today from a newest-first sorted list: the newest
 * period that has already started, or - when every period starts in the
 * future - the oldest one (the soonest to begin). Only an empty list returns
 * undefined. "Nearest today" is what "current" means when the server cannot
 * derive one: opening on the NEWEST period strands the user on a far-future
 * plan while an in-flight (or already ended) period sits unselected. */
function nearestPeriod(periods: Period[]): Period | undefined {
  const today = new Date().toISOString().slice(0, 10)
  return periods.find((p) => p.start_date <= today) ?? periods[periods.length - 1]
}

// Last-viewed currency per budget: applied on mount / budget switch, never
// mid-session. Distinct key from any other stored preference.
const currencyViewKey = (budgetId: number) => `owlgarth_currency_view:${budgetId}`
function loadStoredCurrencyView(budgetId: number): string | null {
  try {
    const value = localStorage.getItem(currencyViewKey(budgetId))
    return typeof value === 'string' && value ? value : null
  } catch {
    return null
  }
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
  const { data: currentPeriod, isSuccess: currentPeriodLoaded, isError: currentPeriodError } = useQuery({
    queryKey: ['current-period', budgetId],
    queryFn: () => budgetsApi.currentPeriod(budgetId),
    enabled: budget != null && budget.cadence !== 'custom',
    retry: false,
  })
  // The periods list is a plain GET, newest first - it beats the lazily
  // materialized current-period fetch, so the materialized current period
  // (not periods[0], the NEWEST) owns the default and planners don't open on
  // a future period. Custom cadence has no derived current period, so there
  // the list is all there is. A terminal ERROR also counts as "known":
  // retry:false makes one failed request (backend restart mid-visit, network
  // blip) final for this mount, so gating on success alone left the picker
  // on its placeholder forever with a perfectly good periods list behind it.
  const currentPeriodKnown = budget?.cadence === 'custom' || currentPeriodLoaded || currentPeriodError

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
    // No materialized current period (custom cadence, or the current-period
    // query failed terminally): fall back to the period nearest today, so a
    // period is ALWAYS selected whenever one exists - an idle picker reads
    // as a dead page. Only a genuinely empty periods list leaves periodId
    // null (the empty-state copy covers it).
    else if (periodId === null && currentPeriodKnown) {
      const nearest = nearestPeriod(allPeriods)
      if (nearest) setPeriodId(nearest.id)
    }
    // Reconcile: a seeded ?period= that no authoritative list contains (typo,
    // stale bookmark, another budget's id) clears so the auto-pick branches
    // above take over. periodsLoaded + currentPeriodKnown gate the "the list
    // is authoritative" premise: for non-custom budgets a VALID seed may
    // equal the lazily-materialized current period that is not in the periods
    // list yet - clearing before currentPeriodKnown would transiently wipe a
    // valid seed while the two queries race. Never writes the URL
    // (user-initiated writes only).
    else if (periodId !== null && periodsLoaded && currentPeriodKnown && !allPeriods.some((p) => p.id === periodId)) setPeriodId(null)
  }, [currentPeriod, periodId, currentPeriodKnown, periodsLoaded, allPeriods])

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

  // Zero enabled currencies (shouldn't happen) - the fallback placeholder
  // can't pose as a real code; the switcher band stays hidden while the
  // enabled list is empty (showCurrencyBand), so it never renders.
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
  // Category management (archive/merge/delete) lives in its own mount-per-use
  // modal; this flag is its open/close.
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)
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

  // Currency carousel: one currency's Planned/Actual/Remaining at a time.
  // Tracked by code, not index, so the view survives a period change; when the
  // selected currency isn't present in the new period, fall back to the first.
  // Sits above the [budgetId] reset effect because that effect seeds it - the
  // compiler lint forbids an effect reaching a setter declared later.
  const [viewCurrency, setViewCurrency] = useState<string | null>(null)

  // Last-viewed-currency seed, as a latest-ref (same shape as periodParamRef
  // above): the sync effect runs before the [budgetId] reset effect below,
  // so the ref holds THIS budget's stored code when the reset reads it. The
  // ref indirection also keeps the opaque localStorage read out of the reset
  // effect - reading it there re-trips the set-state-in-effect lint.
  const storedViewRef = useRef<string | null>(loadStoredCurrencyView(budgetId))
  useEffect(() => {
    storedViewRef.current = loadStoredCurrencyView(budgetId)
  }, [budgetId])

  // Budget→budget navigation (CommandPalette) re-renders this page with a new
  // budgetId. Reset the other per-budget state too, or the summary query runs
  // budgetSummary(B, A_period) → 404 → every row silently renders 0s. Kept in
  // this same effect (not a new one) so the set-state-in-effect warning count
  // stays put — the rule flags once per effect, not per call.
  useEffect(() => {
    // Re-open the budget on its last-viewed currency. Stale codes resolve at
    // render - the active-index derivation falls back to index 0 (first
    // configured) when the code is absent.
    setViewCurrency(storedViewRef.current)
    // Seed from ?period= (deep link / reload) instead of resetting to null.
    // The ref-sync effect declared above has already run for this commit, so
    // the ref holds THIS URL's value (null when no param). Sanctioned
    // extension of an already-flagged effect - no new warning.
    setPeriodId(periodParamRef.current)
    setSelectedCategory(null)
  }, [budgetId])

  // Currency column groups: the budget's configured currencies in stored
  // order (first = default view), with data-only codes (money present in
  // the summary but not configured) appended after in enabled-currency
  // creation order (primary first) - stray money stays visible. Empty
  // config + empty data falls back to the PRIMARY: the first entry of the
  // creation-ordered enabled list - deterministic, never alphabetical.
  const activeCurrencies = useMemo(
    () => activeCurrencyCodes(budget?.currency_codes ?? [], items, currencies.map((c) => c.code), primaryCurrency),
    [items, currencies, budget, primaryCurrency],
  )
  const multiCurrency = activeCurrencies.length > 1
  // The header chip renders only when a single currency is active - with
  // multiple currencies the per-currency strip above the table owns
  // switching, so the header row is gone entirely. Still gated on the budget
  // and the enabled-currency list being known; before that, the codes
  // themselves are unknown. currencies.length also keeps the fallback
  // placeholder code at primaryCurrency from ever rendering in the chip.
  const showCurrencyBand = budget != null && currencies.length > 0

  const currencyIdx = viewCurrency ? Math.max(0, activeCurrencies.indexOf(viewCurrency)) : 0
  const activeCurrency = activeCurrencies[currencyIdx]

  // Same editor-close rule from both switch paths (strip chips and keyboard
  // cycling): never leave a planned-amount editor open across a currency
  // change. Focus stays on the invoking control - no restoration logic.
  const selectCurrency = (code: string) => {
    setViewCurrency(code)
    // Remember the switch so the budget re-opens on this currency next visit.
    localStorage.setItem(currencyViewKey(budgetId), code)
    setEditingCell(null)
  }
  const goToCurrency = (dir: 1 | -1) => {
    const len = activeCurrencies.length
    selectCurrency(activeCurrencies[(currencyIdx + dir + len) % len])
  }

  // Focus targets of the strip chips, keyed by code (roving tabindex).
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Keyboard guard: never hijack arrows inside editable controls - the
  // planned-amount editor input must keep its native caret/number behavior.
  const isEditableTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]')

  // Strip arrows (roving): select AND move focus; Home/End jump to the ends.
  // stopPropagation so the panel handler below does not double-step.
  const onStripKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    const len = activeCurrencies.length
    const idx = activeCurrencies.indexOf(activeCurrency)
    let next: string
    if (e.key === 'Home') next = activeCurrencies[0]
    else if (e.key === 'End') next = activeCurrencies[len - 1]
    else next = activeCurrencies[(idx + (e.key === 'ArrowRight' ? 1 : -1) + len) % len]
    e.preventDefault()
    e.stopPropagation()
    selectCurrency(next)
    chipRefs.current[next]?.focus()
  }

  // Table-region arrows: cycle the view WITHOUT moving focus (focus stays on
  // whatever control the user is on). Skips editable controls (guard above)
  // and the strip, whose own handler stops propagation.
  const onPanelKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    if (!multiCurrency || isEditableTarget(e.target)) return
    e.preventDefault()
    goToCurrency(e.key === 'ArrowRight' ? 1 : -1)
  }

  // Shared between the desktop table header and the mobile card list header
  // (single-currency budgets only - the strip owns switching otherwise). The
  // element is embedded in both places (one copy is always display:none via
  // max-sm:hidden / sm:hidden), so it exists twice in the DOM.
  const currencySwitcher = (
    <span className="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text-muted select-none">
      {activeCurrency}
    </span>
  )

  // Per-currency totals strip: one jump-chip per active currency, each
  // showing its OWN currency's planned total in its own code - never summed
  // or converted across currencies (a sum without conversion rates is
  // meaningless). The meter under each number encodes spend ratio
  // (actual/planned), not currency identity.
  const totals = summary?.totals ?? {}
  const severityFill = (pct: number) => (pct >= 95 ? 'bg-negative' : pct >= 75 ? 'bg-warning' : 'bg-primary')
  const currencyStrip = multiCurrency && (
    <div
      role="tablist"
      aria-label="Budget currency"
      onKeyDown={onStripKeyDown}
      className="flex flex-wrap gap-2 mb-3 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:scrollbar-none"
    >
      {/* The chips are buttons; button text changes are not reliably
          announced (buttons must not be live regions), so this visually
          hidden region carries the active code on every switch. */}
      <span className="sr-only" aria-live="polite">{activeCurrency}</span>
      {activeCurrencies.map((code) => {
        const codeTotals = totals[code]
        const planned = codeTotals ? parseFloat(codeTotals.planned) : 0
        const actual = codeTotals ? parseFloat(codeTotals.actual) : 0
        const isActive = code === activeCurrency
        // Display-only ratio math (the meter fill); never persisted.
        const spendPct = planned > 0 ? (actual / planned) * 100 : 0
        const numberClass = `font-mono text-xs font-medium tabular-nums${isActive ? ' text-text' : ''}${summaryLoading ? ' animate-pulse' : ''}`
        return (
          <button
            key={code}
            ref={(el) => { chipRefs.current[code] = el }}
            type="button"
            role="tab"
            id={`currency-tab-${code}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            aria-controls="budget-currency-panel"
            onClick={() => selectCurrency(code)}
            className={`inline-flex flex-col items-stretch justify-center gap-1 px-2 py-1 border rounded-sm bg-surface select-none transition-colors cursor-pointer min-h-8 pointer-coarse:min-h-[44px] max-sm:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
              isActive ? 'border-primary ring-1 ring-primary' : 'border-border text-text-muted hover:bg-surface-hover hover:text-text'
            }`}
          >
            <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
              <span className={numberClass}>
                {formatAmount(codeTotals ? codeTotals.planned : '0')}
              </span>
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">{code}</span>
            </span>
            {codeTotals && planned > 0 && (
              <span aria-hidden="true" className="block w-full h-1 bg-surface-muted rounded-none overflow-hidden">
                <span
                  className={`block h-full rounded-none transition-all ${severityFill(spendPct)}`}
                  style={{ width: `${Math.min(spendPct, 100)}%` }}
                />
              </span>
            )}
          </button>
        )
      })}
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
        {canWrite && (
          <button type="button" onClick={() => setManageCategoriesOpen(true)} className={secondaryButtonClass}>
            <Tags size={13} className="inline mr-1" /> Manage categories
          </button>
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
        <section
          role="tabpanel"
          id="budget-currency-panel"
          aria-labelledby={activeCurrency ? `currency-tab-${activeCurrency}` : undefined}
          onKeyDown={onPanelKeyDown}
        >
        {currencyStrip}
        {/* Desktop: ledger table. Hidden on mobile in favor of the card list below. */}
        <div className="border border-border rounded-sm bg-surface overflow-x-auto max-sm:hidden">
          <table className="w-full text-sm">
            <thead>
              {showCurrencyBand && !multiCurrency && (
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
          {showCurrencyBand && !multiCurrency && (
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
        </section>
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

      {periodModal && (
        <PeriodFormModal
          key={`${periodModal.mode}-${periodModal.period?.id ?? 'new'}-${periodModal.nonce}`}
          mode={periodModal.mode}
          budgetId={budgetId}
          period={periodModal.period}
          onClose={() => setPeriodModal(null)}
        />
      )}

      {manageCategoriesOpen && (
        <ManageCategoriesModal budgetId={budgetId} onClose={() => setManageCategoriesOpen(false)} />
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
