import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Bookmark, BookmarkPlus, CalendarRange, ChevronLeft, ChevronRight, Merge, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { budgetsApi, reportsApi } from '../api/client'
import type { Period } from '../types'
import type { Bookmark as BookmarkModel } from '../types'
import { useBookmarks } from '../hooks/useBookmarks'
import { useIsTouch } from '../hooks/useBreakpoint'
import { useEnabledCurrencies } from '../hooks/useDomain'
import { useHorizontalStepDrag } from '../hooks/useHorizontalStepDrag'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount, subtractAmounts, sumAmounts } from '../utils/format'
import { activeCurrencyCodes } from '../utils/currencies'
import { getApiErrorMessage } from '../utils/errors'
import { normalizeAmountInput, parseAmountNumber } from '../utils/amountInput'
import { intParam } from '../utils/params'
import Modal from '../components/common/Modal'
import Select from '../components/common/Select'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import PeriodFormModal from '../components/modals/budgets/PeriodFormModal'
import ManageCategoriesModal from '../components/modals/budgets/ManageCategoriesModal'
import BookmarkFormModal from '../components/modals/bookmarks/BookmarkFormModal'
import BudgetCategoryList from '../components/budgets/BudgetCategoryList'
import BudgetSummaryCard from '../components/budgets/BudgetSummaryCard'
import PeriodPicker from '../components/budgets/PeriodPicker'
import PageHeader from '../components/layout/PageHeader'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

/** The day after an ISO date, as an ISO date (local, no TZ shifts). */
function nextDayIso(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(y, m - 1, d + 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

/** Draft key: one planned figure per category and currency. */
const planKey = (categoryId: number, currencyCode: string) => `${categoryId}:${currencyCode}`

/** Canonical compare form for changed-row detection: the wire shape with
 *  trailing fraction zeros stripped, so a retyped whole number ('150')
 *  equals its loaded form ('150.00') and cosmetic retypes fire no PUT.
 *  '' is the clear gesture - it compares as '0', the API's no-plan value.
 *  null = unparseable draft (counts as changed; Save blocks on it). */
const canonicalAmount = (raw: string): string | null => {
  const normalized = raw === '' ? '0' : normalizeAmountInput(raw)
  if (normalized === null) return null
  return normalized.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
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

// Desktop ledger row order per budget: applied on mount / budget switch,
// never mid-session. Same stored-preference shape as the currency view
// above - distinct key from any other stored preference. Unknown, missing
// or garbage values clamp to the default (attention-first), so a stale or
// hand-edited value can never blank the order control. localStorage only -
// never the URL: the page's URL contract is frozen to ?period= /
// ?currency=, and the order choice is a per-budget convenience, not a
// shareable view.
type RowOrder = 'attention' | 'natural'
const budgetOrderKey = (budgetId: number) => `owlgarth_budget_order:${budgetId}`
function loadStoredBudgetOrder(budgetId: number): RowOrder {
  try {
    return localStorage.getItem(budgetOrderKey(budgetId)) === 'natural' ? 'natural' : 'attention'
  } catch {
    return 'attention'
  }
}

/** Currency-strip chip number classes: mono figure, active-currency
 *  emphasis, summary-refetch shimmer. A module-level helper so the class
 *  fragments are built outside JSX expression containers (styling, never
 *  UI text). */
const stripNumberClass = (isActive: boolean, summaryLoading: boolean): string =>
  `font-mono text-xs font-medium tabular-nums${isActive ? ' text-text' : ''}${summaryLoading ? ' animate-pulse' : ''}`

/** Attention status for one ledger row, shared by the desktop chips and
 *  the attention-first order: over = spent more than planned (exact cents
 *  via subtractAmounts - the group boundary is a status claim, not a
 *  display rounding), near limit = 75% and up but not over, else ok. pct
 *  is display-only float math, same register as the currency strip's meter
 *  fill, and deliberately NOT the strip's 95% split - this is the row
 *  status the phone cards (BudgetCategoryList) already use. */
type RowStatus = 'over' | 'near' | 'ok'
function attentionOf(planned: string, actual: string): { status: RowStatus; pct: number } {
  const plannedNum = parseAmountNumber(planned) ?? 0
  const actualNum = parseAmountNumber(actual) ?? 0
  // Exact sign check: subtractAmounts never returns '-0.00', so a leading
  // minus is exactly "actual below planned" and '0.00' is "equal".
  const diff = subtractAmounts(actual, planned)
  const pct = plannedNum > 0 ? (actualNum / plannedNum) * 100 : actualNum > 0 ? Number.POSITIVE_INFINITY : 0
  if (!diff.startsWith('-') && diff !== '0.00') return { status: 'over', pct }
  if (pct >= 75) return { status: 'near', pct }
  return { status: 'ok', pct }
}

const ATTENTION_RANK: Record<RowStatus, number> = { over: 0, near: 1, ok: 2 }

/** Status chips in the sticky category cell: status never relies on color
 *  alone - the word carries it. Bordered rectangular shape per the page's
 *  own currency chip, never a pill. Over = text-negative; Near limit wears
 *  the warning text token. */
const statusChipBase =
  'inline-flex items-center px-2 py-0.5 border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider select-none shrink-0'
const statusOverChipClass = `${statusChipBase} text-negative border-negative/20 bg-negative-bg`
const statusNearChipClass = `${statusChipBase} text-warning-text bg-surface border-border`

/** Status of a budget category row: over = spent more than planned, near =
 *  75% or more of plan without going over, else on track. Structural twin
 *  of BudgetCategoryCardRow['status'] - no cross-file type import. */
type CategoryStatus = 'over' | 'near' | 'onTrack'

export default function BudgetDetailPage() {
  const { t } = useTranslation('budgets')
  const { t: tCommon } = useTranslation('common')
  const { t: tBookmarks } = useTranslation('bookmarks')
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
  const { data: bookmarks = [] } = useBookmarks()

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

  // ?currency= deep-link seed (budget bookmarks), as a latest-ref - same
  // shape and same declaration constraint as periodParamRef above: the sync
  // effect must run before the [budgetId] reset effect below, so on mount
  // and on budget-to-budget navigation the ref already holds the NEW URL's
  // value when the reset seeds the view currency from it.
  const currencyParamRef = useRef<string | null>(searchParams.get('currency'))
  useEffect(() => {
    currencyParamRef.current = searchParams.get('currency')
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

  // Latest allPeriods, as a latest-ref (same shape as periodParamRef below):
  // the [budgetId] reset effect's guarded period seed needs to know whether
  // the id it is about to clear belongs to THIS budget, but naming allPeriods
  // in that effect's deps would re-run the whole reset - including its
  // viewCurrency seed - on every periods refetch. Ref reads are exempt from
  // exhaustive-deps; this sync effect's body is only the ref write. Declared
  // before the reset effect, so on every commit the ref is fresh when the
  // reset reads it (effects run in declaration order).
  const allPeriodsRef = useRef(allPeriods)
  useEffect(() => {
    allPeriodsRef.current = allPeriods
  }, [allPeriods])

  // Summary gate (declared after the allPeriods memo - TDZ): on budget-to-
  // budget navigation the [budgetId] reset effect runs one commit later than
  // this render, so periodId still holds the PREVIOUS budget's period for a
  // single render. Without the gate that render fires budgetSummary(B,
  // A_period) -> a transient red 404 in the network tab (the reset then
  // clears the id and the UI recovers, but the stray request is noise).
  // Gating on membership in allPeriods also keeps a garbage ?period= seed
  // from hitting the server at all - the reconcile render-adjust clears it locally.
  // A derived const, not state: zero set-state-in-effect cost.
  const summaryPeriodId = allPeriods.some((p) => p.id === periodId) ? periodId : undefined
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['budget-summary', budgetId, summaryPeriodId],
    queryFn: () => reportsApi.budgetSummary(budgetId, summaryPeriodId!),
    enabled: summaryPeriodId != null,
  })

  // Default the selection and reconcile URL seeds - a render-time adjust
  // (guarded setState during render), not an effect: the branches settle
  // BEFORE the commit instead of one render after it. Plain code, not a
  // hook: it reads only values declared above (periodId, currentPeriod,
  // currentPeriodKnown, allPeriods, periodsLoaded) and every branch
  // invalidates its own guard on the immediate re-render, so it cannot
  // loop. The [budgetId] reset effect below still runs its functional
  // setPeriodId after this render, so a seeded ?period= still beats this
  // auto-pick when react-query cache makes currentPeriod available in the
  // first commit.
  if (periodId === null && currentPeriod) {
    setPeriodId(currentPeriod.id)
  } else if (periodId === null && currentPeriodKnown) {
    // No materialized current period (custom cadence, or the current-period
    // query failed terminally): fall back to the period nearest today, so a
    // period is ALWAYS selected whenever one exists - an idle picker reads
    // as a dead page. Only a genuinely empty periods list leaves periodId
    // null (the empty-state copy covers it).
    const nearest = nearestPeriod(allPeriods)
    if (nearest) setPeriodId(nearest.id)
  } else if (periodId !== null && periodsLoaded && currentPeriodKnown && !allPeriods.some((p) => p.id === periodId)) {
    // Reconcile: a seeded ?period= that no authoritative list contains (typo,
    // stale bookmark, another budget's id) clears so the auto-pick branches
    // above take over. periodsLoaded + currentPeriodKnown gate the "the list
    // is authoritative" premise: for non-custom budgets a VALID seed may
    // equal the lazily-materialized current period that is not in the periods
    // list yet - clearing before currentPeriodKnown would transiently wipe a
    // valid seed while the two queries race. Never writes the URL
    // (user-initiated writes only).
    setPeriodId(null)
  }

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
  // selectPeriod lives with the other switch handlers below the edit-plan
  // derivation: its unsaved-changes guard reads that state, and this file
  // keeps every callee declared before its callers.

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
    onError: (error) => toast.error(getApiErrorMessage(error, t('detail.addCategoryFailed'))),
  })

  // Edit-plan mode: the page owns every piece of edit state; the category
  // list and the desktop table only render what they are given. Sits above
  // the [budgetId] reset effect because that effect clears it.
  const [editOpen, setEditOpen] = useState(false)
  // Raw draft strings keyed by `${categoryId}:${currencyCode}`. Seeded once
  // at edit-mode entry from the loaded planned values of the viewed
  // currency; a key present = that row renders an input. The value type
  // admits undefined so lookups can be compared against it (a missing key
  // IS "no input"); nothing ever stores undefined.
  const [planDrafts, setPlanDrafts] = useState<Record<string, string | undefined>>({})
  // Server error per row key, shown inline under a failed row's input.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [isSavingPlan, setIsSavingPlan] = useState(false)
  // The deferred action behind the discard-changes confirm: either a plain
  // exit (Cancel clicked) or exit-then-switch (period/currency change).
  const [discardConfirm, setDiscardConfirm] = useState<{ message: string; proceed: () => void } | null>(null)

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
      toast.success(t('detail.merged'))
      setMergeOpen(false)
      setMergeSourceId(null)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('detail.mergeFailed'))),
  })

  // Custom-cadence period management. `nonce` forces a keyed remount of
  // PeriodFormModal per open session so its lazy state initializers re-run —
  // edit prefill and add-mode defaults with zero open-effects.
  const [periodModal, setPeriodModal] = useState<{ mode: 'add' | 'edit'; period: Period | null; nonce: number } | null>(null)
  const [deletingPeriod, setDeletingPeriod] = useState<Period | null>(null)
  // Category management (archive/merge/delete) lives in its own mount-per-use
  // modal; this flag is its open/close.
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false)
  // Bookmark modal (mount-per-use). The open state carries the session mode
  // latched at click time from the derived match, because the modal derives
  // its submit path from props on every render: a mid-open list refetch can
  // flip the live match, and a render-site ternary would swap a mounted form
  // between create and edit mid-session. Latching freezes the session; the
  // close-then-reopen remount re-seeds the form either way (the header button
  // stays the only opener, so a null state always renders between sessions).
  const [bookmarkModal, setBookmarkModal] =
    useState<{ mode: 'create' } | { mode: 'edit'; bookmark: BookmarkModel } | null>(null)
  const openPeriodModal = (mode: 'add' | 'edit', period: Period | null = null) =>
    setPeriodModal({ mode, period, nonce: Date.now() })

  const deletePeriod = useMutation({
    mutationFn: (id: number) => budgetsApi.deletePeriod(budgetId, id),
    onSuccess: async (_result, deletedId) => {
      // Await the periods refetch BEFORE clearing the selection: the null-picker
      // render-adjust (above) picks from whatever list it sees — picking
      // from a stale list could re-select the just-deleted id (ghost periodId →
      // selectedPeriod null → dead page). After the await, the re-render reads
      // the fresh cache.
      await queryClient.invalidateQueries({ queryKey: ['periods', budgetId] })
      queryClient.invalidateQueries({ queryKey: ['budget-summary', budgetId] })
      queryClient.invalidateQueries({ queryKey: ['budget-history', budgetId] })
      toast.success(t('detail.periodDeleted'))
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
      toast.error(getApiErrorMessage(error, t('detail.deletePeriodFailed')))
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

  // goToPeriod lives with the other switch handlers below the edit-plan
  // derivation (same unsaved-changes guard); isPlanningNext state stays
  // here - the chevrons' disabled logic below reads it.

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

  // Desktop row order: "Needs attention first" (default) or the natural
  // category order. The phone list grouping is its own order and never
  // reads this. Same latest-ref shape as storedViewRef directly above: the
  // sync effect must run BEFORE the [budgetId] reset effect below, so on
  // mount and budget-to-budget navigation the ref already holds THIS
  // budget's stored order when the reset seeds from it.
  const [rowOrder, setRowOrder] = useState<RowOrder>('attention')
  const storedOrderRef = useRef<RowOrder>(loadStoredBudgetOrder(budgetId))
  useEffect(() => {
    storedOrderRef.current = loadStoredBudgetOrder(budgetId)
  }, [budgetId])

  // Budget→budget navigation (CommandPalette) re-renders this page with a new
  // budgetId. Reset the other per-budget state too, or the summary query runs
  // budgetSummary(B, A_period) → 404 → every row silently renders 0s. Kept in
  // this same effect (not a new one) so the set-state-in-effect warning count
  // stays put — the rule flags once per effect, not per call.
  useEffect(() => {
    // Re-open the budget on the ?currency= deep-link seed (budget bookmark),
    // else its last-viewed currency. The seed writes neither the URL nor
    // localStorage - selectCurrency keeps owning persistence - and a stale
    // code resolves at render: the active-index derivation below falls back
    // to index 0 (first configured) when the code is absent.
    // (Local const: a setState argument coalescing two ref reads directly
    // trips set-state-in-effect, while a single ref read or a seeded local
    // passes - the ref-write-only sync effects keep this seed lint-quiet.)
    const seededCurrency = currencyParamRef.current ?? storedViewRef.current
    setViewCurrency(seededCurrency)
    // Seed from ?period= (deep link / reload) instead of resetting to null.
    // The ref-sync effect declared above has already run for this commit, so
    // the ref holds THIS URL's value (null when no param). Sanctioned
    // extension of an already-flagged effect - no new warning.
    //
    // FUNCTIONAL and membership-guarded: with a warm react-query cache
    // (navigate list -> budget -> back -> budget) currentPeriod is already
    // available on the first commit, so the auto-pick effect above has queued
    // this budget's current period in this same flush - a bare
    // setPeriodId(null) (no URL param) would coalesce over it, and since
    // periodId renders null both before and after, no dep ever changes: the
    // auto-pick never re-runs and the picker strands on its placeholder. The
    // guard keeps a same-flush pick that belongs to THIS budget, clears only
    // ids from another budget (live budget-to-budget navigation), and still
    // lets an explicit ?period= seed win outright.
    setPeriodId((prev) => {
      const seeded = periodParamRef.current
      if (seeded != null) return seeded
      return prev != null && allPeriodsRef.current.some((p) => p.id === prev) ? prev : null
    })
    setSelectedCategory(null)
    // Edit mode is per-budget-session state; a draft map from the previous
    // budget must never survive the navigation. Same effect, zero new
    // set-state-in-effect cost (the rule flags once per effect).
    setEditOpen(false)
    setPlanDrafts({})
    setRowErrors({})
    // Re-open on this budget's stored desktop row order (attention-first
    // when nothing is stored). A single ref read as the setState argument
    // stays lint-quiet - the same bailout storedViewRef's seed relies on.
    setRowOrder(storedOrderRef.current)
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

  // Rows: one per active category, with planned/actual/remaining for the
  // currency currently shown. Sits above the switch handlers and the
  // edit-plan derivation, both of which read it.
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

  // Desktop tbody order: attention-first reorders the DESKTOP tbody only -
  // the phone list groups on its own, and the tfoot totals are
  // order-independent exact sums. Over rows first, then near limit,
  // percent descending inside each; ok rows after in natural order
  // (Array#sort is stable, so returning 0 for same-rank rows preserves
  // it). Reordering is safe mid-edit-plan: drafts are keyed by category
  // id, not by row position. Plain derivation, not a memo - rows is a
  // fresh array every render, so a memo dep on it would trip the
  // dependencies-change-every-render lint for nothing.
  const orderedRows =
    rowOrder === 'attention'
      ? rows
          .map((row) => ({ row, attention: attentionOf(row.planned, row.actual) }))
          .sort((a, b) => {
            const ra = ATTENTION_RANK[a.attention.status]
            const rb = ATTENTION_RANK[b.attention.status]
            if (ra !== rb) return ra - rb
            return ra === ATTENTION_RANK.ok ? 0 : b.attention.pct - a.attention.pct
          })
          .map((entry) => entry.row)
      : rows

  // Rows whose draft differs from the loaded planned value (normalized
  // compare; an invalid draft counts as changed). Order follows rows, so
  // the sequential save and its per-row outcomes are deterministic.
  const changedRows = rows.filter(({ category, planned }) => {
    const draft = planDrafts[planKey(category.id, activeCurrency)]
    if (draft === undefined) return false
    const a = canonicalAmount(draft)
    const b = canonicalAmount(planned)
    return a === null || b === null ? draft !== planned : a !== b
  })
  const changedCount = changedRows.length
  // A non-empty draft that cannot normalize blocks Save (shared validation
  // toast, same behavior the old single-cell editor had).
  const hasInvalidDraft = rows.some(({ category }) => {
    const draft = planDrafts[planKey(category.id, activeCurrency)]
    return draft !== undefined && draft !== '' && normalizeAmountInput(draft) === null
  })

  const exitEditMode = () => {
    setEditOpen(false)
    setPlanDrafts({})
    setRowErrors({})
  }

  // Entry is an event handler (the header button), never an effect: the
  // drafts snapshot the planned values as loaded at click time. Rows added
  // mid-session (Manage categories) have no draft and stay read-only until
  // the next entry - the inputs render only for keys present in the map.
  const enterEditMode = () => {
    setPlanDrafts(Object.fromEntries(rows.map(({ category, planned }) => [planKey(category.id, activeCurrency), planned])))
    setRowErrors({})
    setEditOpen(true)
  }

  // One confirm dialog, two uses: Cancel-with-changes (discards and exits)
  // and a period/currency switch while dirty (discards, exits, proceeds).
  const requestDiscard = (message: string, proceed: () => void) => setDiscardConfirm({ message, proceed })

  // Setting a draft clears any stale server error on that row.
  const onDraftChange = (key: string, value: string) => {
    setPlanDrafts((prev) => ({ ...prev, [key]: value }))
    setRowErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // Currency switch with an unsaved-changes guard: a dirty switch that
  // exited silently would destroy typed drafts with no trace, while a clean
  // switch has nothing to lose - so clean switches exit edit mode without
  // interruption and dirty ones ask via the discard dialog. Covers every
  // entry point (strip chips, keyboard cycling) because they all route
  // through here. Focus stays on the invoking control - no restoration.
  const selectCurrency = (code: string) => {
    if (isSavingPlan) return
    const apply = () => {
      setViewCurrency(code)
      // Remember the switch so the budget re-opens on this currency next visit.
      localStorage.setItem(currencyViewKey(budgetId), code)
    }
    if (!editOpen) return apply()
    if (changedCount === 0) { exitEditMode(); return apply() }
    requestDiscard(t('detail.confirmCancelEdit.message', { count: changedCount }), () => { exitEditMode(); apply() })
  }
  const goToCurrency = (dir: 1 | -1) => {
    const len = activeCurrencies.length
    selectCurrency(activeCurrencies[(currencyIdx + dir + len) % len])
  }

  // Remember the desktop row order so this budget re-opens in it. The
  // stored-preference write is handler-only, mirroring selectCurrency
  // above; the URL is never touched.
  const selectRowOrder = (order: RowOrder) => {
    setRowOrder(order)
    localStorage.setItem(budgetOrderKey(budgetId), order)
  }

  // Period switch (picker selection) with the same unsaved-changes guard.
  // The URL write still happens only from this handler (after any confirm),
  // never from an effect.
  const selectPeriod = (id: number) => {
    if (isSavingPlan) return
    const apply = () => {
      setPeriodId(id)
      writePeriodParam(id)
    }
    if (!editOpen) return apply()
    if (changedCount === 0) { exitEditMode(); return apply() }
    requestDiscard(t('detail.confirmCancelEdit.message', { count: changedCount }), () => { exitEditMode(); apply() })
  }

  // Chronological stepper (header chevrons), same guard wrapped around
  // BOTH branches: the direct jump to a listed period and the
  // materialize-next-period API call.
  const goToPeriod = async (dir: 1 | -1) => {
    // isPlanningNext is guarded here, not just on the next-chevron's
    // disabled prop: a second step (a swipe or the PREV chevron) while the
    // next period is materializing would race the in-flight currentPeriod
    // call and land on the wrong period.
    if (selectedIdx < 0 || isSavingPlan || isPlanningNext) return
    const apply = async () => {
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
          toast.error(getApiErrorMessage(error, t('detail.openNextFailed')))
        } finally {
          setIsPlanningNext(false)
        }
      }
    }
    if (!editOpen) return apply()
    if (changedCount === 0) { exitEditMode(); return apply() }
    requestDiscard(t('detail.confirmCancelEdit.message', { count: changedCount }), () => { exitEditMode(); void apply() })
  }

  // A horizontal drag on the phone content block (the sm:hidden
  // summary-card + category-cards block below) steps the period through
  // the SAME goToPeriod the header chevrons call, so the URL contract is
  // untouched (writePeriodParam stays the only writer; the auto-pick and
  // reconcile effects never write). Attached ONLY to that named
  // non-scrollable region - never to the currency chip strip or the
  // desktop ledger wrapper, which both scroll horizontally; every
  // horizontally scrollable region on this page is a sibling OUTSIDE the
  // attachment, so a drag on it never reaches this handler and it scrolls
  // natively. The desktop ledger is the max-sm:hidden sibling at >=640,
  // so a coarse-pointer tablet gets no page-swipe target by construction
  // (its content IS the scrollable table; the chevrons remain its
  // controls). pointerCapture is OFF: capture would retarget the cards'
  // and Activity links' taps to the wrapper and break them. A swipe under
  // dirty edit-plan drafts inherits goToPeriod's requestDiscard confirm -
  // the same handler as the chevrons, intended. This page has no row
  // swipes (those live on the Activity lists), so row and page swipes
  // never share a screen.
  const isCoarse = useIsTouch()
  const periodStepDrag = useHorizontalStepDrag({
    onStep: (dir) => { void goToPeriod(dir) },
    enabled: isCoarse,
    pointerCapture: false,
  })

  // Save plan: validate before any request, then sequentially PUT only the
  // changed rows of the viewed currency - exact strings end to end (''
  // sends '0', the API's no-plan value; a typed draft sends its normalized
  // string, never a float). Partial failure keeps going: succeeded rows
  // close their inputs, failed rows keep their draft and gain the server
  // error inline, and exactly one toast carries the failed count.
  const savePlan = async () => {
    if (hasInvalidDraft) return toast.error(tCommon('validation.amountInvalid'))
    setIsSavingPlan(true)
    const failed: { key: string; message: string }[] = []
    const savedKeys: string[] = []
    for (const { category } of changedRows) {
      const key = planKey(category.id, activeCurrency)
      const draft = planDrafts[key] ?? ''
      const amount = draft === '' ? '0' : normalizeAmountInput(draft)!
      try {
        await budgetsApi.setCategoryBudget(budgetId, periodId!, {
          category_id: category.id,
          currency_code: activeCurrency,
          amount,
        })
        savedKeys.push(key)
      } catch (error) {
        // One inline error per failed row; the toast below fires once.
        failed.push({ key, message: getApiErrorMessage(error, t('detail.setAmountFailed')) })
      }
    }
    // Succeeded rows exit edit mode (their key leaves the drafts map, so
    // the input closes and the refreshed planned value renders); failed
    // rows keep their draft and gain the server error under the input.
    if (savedKeys.length > 0) {
      setPlanDrafts((prev) => {
        const next = { ...prev }
        savedKeys.forEach((key) => delete next[key])
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['budget-summary', budgetId, periodId] })
    }
    setIsSavingPlan(false)
    if (failed.length > 0) {
      setRowErrors(Object.fromEntries(failed.map((f) => [f.key, f.message])))
      toast.error(t('detail.saveFailedCount', { count: failed.length }))
    } else {
      exitEditMode()
    }
  }

  // Footer Cancel: dirty edits ask before being discarded; a clean exit
  // needs no interruption. Never fires while a save is in flight.
  const cancelEdit = () => {
    if (isSavingPlan) return
    if (changedCount === 0) return exitEditMode()
    requestDiscard(t('detail.confirmCancelEdit.message', { count: changedCount }), exitEditMode)
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
      aria-label={t('detail.currencyTablist')}
      onKeyDown={onStripKeyDown}
      className="flex flex-wrap gap-2 mb-3 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:scrollbar-none"
    >
      {/* The chips are buttons; button text changes are not reliably
          announced (buttons must not be live regions), so this visually
          hidden region carries the active code on every switch. */}
      <span className="sr-only" aria-live="polite">{activeCurrency}</span>
      {activeCurrencies.map((code) => {
        const codeTotals = totals[code]
        const planned = codeTotals ? (parseAmountNumber(codeTotals.planned) ?? 0) : 0
        const actual = codeTotals ? (parseAmountNumber(codeTotals.actual) ?? 0) : 0
        const isActive = code === activeCurrency
        // Display-only ratio math (the meter fill); never persisted.
        const spendPct = planned > 0 ? (actual / planned) * 100 : 0
        const numberClass = stripNumberClass(isActive, summaryLoading)
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

  // Exact column totals for the currency shown, summed straight off the
  // rows the table renders - NOT summary.totals, whose API values include
  // archived categories' money this table hides. BigInt cents, never float.
  const totalPlanned = sumAmounts(rows.map((r) => r.planned))
  const totalActual = sumAmounts(rows.map((r) => r.actual))
  const totalRemaining = sumAmounts(rows.map((r) => r.remaining))
  // String-sign check: toCents is not exported, and sumAmounts never
  // returns '-0.00', so a leading minus is exactly "the total is negative".
  const totalRemainingNegative = totalRemaining.startsWith('-')
  const totalLabel = t('detail.total')

  // Activity link params, frozen: the viewed period's bounds travel
  // verbatim in Activity's own filter vocabulary (the category param
  // parses as a CSV list on the Activity side, from/to are ISO dates). A
  // degenerate no-period render (transient auto-pick pass) links without
  // bounds rather than linking nowhere.
  const activityPeriodSearch = selectedPeriod
    ? `&from=${selectedPeriod.start_date}&to=${selectedPeriod.end_date}`
    : ''

  // Phone category cards: the table rows enriched with display-only status,
  // spend ratio (bar width + attention ordering) and the Activity deep link
  // for the viewed period. Persisted amounts stay exact strings;
  // parseAmountNumber math is display-only and never sent back.
  const phoneCards = rows.map((row) => {
    const plannedNum = parseAmountNumber(row.planned) ?? 0
    const actualNum = parseAmountNumber(row.actual) ?? 0
    const status: CategoryStatus =
      actualNum > plannedNum ? 'over' : plannedNum > 0 && actualNum / plannedNum >= 0.75 ? 'near' : 'onTrack'
    return {
      ...row,
      status,
      pct: plannedNum > 0 ? (actualNum / plannedNum) * 100 : 0,
      // Frozen Activity filter params for the viewed period (the category
      // param parses as a CSV list on the Activity side); a null
      // selectedPeriod (transient auto-pick render) degrades to the
      // category-only link rather than emitting from=undefined.
      activityUrl: selectedPeriod
        ? `/transactions?category=${row.category.id}&from=${selectedPeriod.start_date}&to=${selectedPeriod.end_date}`
        : `/transactions?category=${row.category.id}`,
    }
  })
  // Needs attention first: over-budget rows, then near-limit, percent
  // descending inside each; On track keeps natural category order - the
  // worst rows surface without scrolling.
  const byPctDesc = (a: (typeof phoneCards)[number], b: (typeof phoneCards)[number]) => b.pct - a.pct
  const phoneGroups = [
    {
      key: 'attention' as const,
      rows: [
        ...phoneCards.filter((r) => r.status === 'over').sort(byPctDesc),
        ...phoneCards.filter((r) => r.status === 'near').sort(byPctDesc),
      ],
    },
    { key: 'onTrack' as const, rows: phoneCards.filter((r) => r.status === 'onTrack') },
  ]

  // Resolved in the body, not inside the JSX: the literal-string lint only
  // recognizes the unaliased t() callee, in attributes and children alike.
  const addLabel = tBookmarks('addLabel')
  const editLabel = tBookmarks('editLabel')

  // List is position-ordered (hook contract), so find() IS "first in position
  // order". Non-archived only - is_active is irrelevant (a sidebar-hidden
  // bookmark is still the bookmark this button would edit).
  const matchedBookmark =
    bookmarks.find(
      (b) => b.kind === 'budget' && b.budget_id === budgetId
        && b.currency_code === activeCurrency && !b.is_archived,
    ) ?? null

  return (
    <div className="p-6 max-sm:p-0 max-w-4xl mx-auto">
      {/* Mobile: title first line, period switcher wraps to a full-width row below. */}
      <PageHeader
        backTo="/budgets"
        breadcrumb={t('title')}
        title={budget?.name ?? t('budgetFallback')}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* One wrapping group for both action clusters: the header's
                actions slot does not wrap itself, so this group owns the
                phone-width wrapping. */}
            {allPeriods.length > 0 && (
              <div className="flex items-center gap-1 max-sm:w-full">
                <button
                  type="button"
                  onClick={() => goToPeriod(-1)}
                  disabled={!hasPrev}
                  aria-label={t('detail.previousPeriod')}
                  className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
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
                  aria-label={t('detail.nextPeriod')}
                  title={selectedIdx === ascPeriods.length - 1 && canPlanAhead ? t('detail.planNextPeriod') : undefined}
                  className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
                {budget?.cadence === 'custom' && canManageAccounts && (
                  <>
                    {/* Divider between period navigation and period management
                        (patterns.md §5 group divider, vertical form). Also keeps
                        the chevrons' touch-hit areas clear of these buttons'. */}
                    <span className="w-px h-4 bg-border mx-1" aria-hidden="true" />
                    {/* Adjacent icon buttons (BudgetsPage pattern): real padded hit
                        areas instead of .touch-hit (expanded areas would overlap -
                        responsive.md); §3 restores the hover bg the card buttons
                        omit, and rounded-none for icon-only. */}
                    <button
                      type="button"
                      onClick={() => openPeriodModal('add')}
                      title={t('detail.addPeriod')}
                      aria-label={t('detail.addPeriod')}
                      className="flex items-center justify-center p-1.5 rounded-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 text-text-muted hover:text-text hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => selectedPeriod && openPeriodModal('edit', selectedPeriod)}
                      disabled={!selectedPeriod}
                      title={selectedPeriod ? t('detail.editPeriodAria', { name: selectedPeriod.name }) : t('detail.editPeriod')}
                      aria-label={selectedPeriod ? t('detail.editPeriodAria', { name: selectedPeriod.name }) : t('detail.editPeriod')}
                      className="flex items-center justify-center p-1.5 rounded-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      <Pencil size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => selectedPeriod && setDeletingPeriod(selectedPeriod)}
                      disabled={!selectedPeriod}
                      title={selectedPeriod ? t('detail.deletePeriodAria', { name: selectedPeriod.name }) : t('detail.deletePeriod')}
                      aria-label={selectedPeriod ? t('detail.deletePeriodAria', { name: selectedPeriod.name }) : t('detail.deletePeriod')}
                      className="flex items-center justify-center p-1.5 rounded-none pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 text-text-muted hover:text-negative hover:bg-negative-bg transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                    >
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            )}
            {/* Header action group: the labeled actions wrap as ONE unit so
                justify-between can never fling them to opposite ends of the row,
                and a wrapping row carries them together. The group itself wraps
                only when the two buttons cannot share a line at all. */}
            <div className="flex flex-wrap items-center gap-3">
              {canEditPlan && !editOpen && !summaryLoading && (
                /* Edit plan: page-wide draft mode for the viewed currency.
                   Absent while open - the sticky footer owns exiting - and
                   while the summary is still loading: entering then would
                   snapshot the not-yet-loaded rows (planned '0') and read
                   every row as changed. */
                <button type="button" onClick={enterEditMode} className={secondaryButtonClass}>
                  <Pencil size={13} className="inline mr-1" /> {t('detail.editPlan')}
                </button>
              )}
              {canWrite && (
                <button type="button" onClick={() => setManageCategoriesOpen(true)} className={secondaryButtonClass}>
                  <Tags size={13} className="inline mr-1" /> {t('detail.manageCategories')}
                </button>
              )}
              {/* Bookmark this budget+currency view, labeled like its sibling
                  header action. Any role - personal resource: a bookmark is the
                  user's own convenience view, never a workspace mutation. With a
                  matching non-archived bookmark already saved for this budget and
                  the viewed currency, the button becomes the edit affordance for
                  that row (filled glyph) instead of a second create. */}
              <button
                type="button"
                onClick={() =>
                  setBookmarkModal(matchedBookmark ? { mode: 'edit', bookmark: matchedBookmark } : { mode: 'create' })
                }
                className={secondaryButtonClass}
              >
                {matchedBookmark
                  ? <Bookmark size={13} fill="currentColor" className="inline mr-1" />
                  : <BookmarkPlus size={13} className="inline mr-1" />}{' '}
                {matchedBookmark ? editLabel : addLabel}
              </button>
            </div>
          </div>
        }
        showAccountActions
      />

      {isPast && (
        <p className="text-xs text-warning-text mb-3">{t('detail.pastPeriodNote')}</p>
      )}
      {isFuture && (
        <p className="text-xs text-text-muted mb-3">{t('detail.futurePeriodNote')}</p>
      )}

      {budget?.cadence === 'custom' && periods.length === 0 ? (
        /* Custom budget with no periods: nothing to summarize or plan — the
           designed empty state (patterns.md §2 "Periods" row) replaces the
           ledger. Non-admins see the message without the CTA. */
        <EmptyState
          icon={<CalendarRange size={48} strokeWidth={1.5} className="text-text-muted/30" />}
          heading={t('periods.emptyHeading')}
          message={t('periods.emptyMessage')}
          action={canManageAccounts ? { label: t('periods.addPeriod'), onClick: () => openPeriodModal('add') } : undefined}
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
        {/* Desktop only: row-order control - needs-attention-first is the
            default; the natural category order is one click away and
            remembered per budget. Phones do without it: their card list
            groups by attention on its own. w-56 matches the PeriodPicker
            width idiom. */}
        <div className="flex items-center justify-end mb-2 max-sm:hidden">
          <Select
            value={rowOrder}
            onChange={selectRowOrder}
            options={[
              { value: 'attention', label: t('detail.sortOptionAttention') },
              { value: 'natural', label: t('detail.sortOptionNatural') },
            ]}
            aria-label={t('detail.sortAriaLabel')}
            className="w-56"
          />
        </div>
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
                <th className="text-left px-4 py-2 sticky left-0 z-10 bg-surface">{t('detail.colCategory')}</th>
                <th className="text-right px-4 py-2">{t('detail.colPlanned')}</th>
                <th className="text-right px-4 py-2">{t('detail.colActual')}</th>
                <th className="text-right px-4 py-2">{t('detail.colRemaining')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orderedRows.map(({ category, planned, actual, remaining }) => {
                const cellKey = `${category.id}:${activeCurrency}`
                const draft = planDrafts[cellKey]
                const isSelected = selectedCategory === category.id
                const attention = attentionOf(planned, actual)
                return (
                  <tr
                    key={category.id}
                    tabIndex={0}
                    onClick={() => toggleSelected(category.id)}
                    onKeyDown={(e) => {
                      // Same guard as the mobile cards: only when the row itself
                      // is focused - Enter/Space inside the batch planned inputs
                      // must keep their native behavior.
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        toggleSelected(category.id)
                      }
                    }}
                    className={`cursor-pointer ${isSelected ? 'bg-surface-hover' : ''}`}
                  >
                    {/* Sticky cell keeps its own solid bg mirroring the row
                        state and the inset selection-accent bar. Inside:
                        the Activity link (name + trailing chevron - a bare
                        label does not read as a link) and the status chip.
                        The name truncates inside the cell so long names
                        share the sticky cell with the chip at narrow table
                        widths; the former max-sm width was dead (the table
                        is max-sm:hidden) and is dropped on this edited
                        line. The chevron sits inside the Link but outside
                        the truncating span so it can never be ellipsized
                        away. */}
                    <td className={`px-4 py-2 text-text whitespace-nowrap sticky left-0 z-10 max-w-[16rem] overflow-hidden ${isSelected ? 'bg-surface-hover shadow-[inset_2px_0_0_var(--color-border-focus)]' : 'bg-surface'}`}>
                      <span className="flex items-center gap-2">
                        <Link
                          to={`/transactions?category=${category.id}${activityPeriodSearch}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 min-w-0 hover:text-primary transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                        >
                          <span className="truncate">{category.name}</span>
                          <ChevronRight size={12} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-text-muted" />
                        </Link>
                        {attention.status === 'over' && (
                          <span className={statusOverChipClass}>{t('detail.statusOver')}</span>
                        )}
                        {attention.status === 'near' && (
                          <span className={statusNearChipClass}>{t('detail.statusNearLimit')}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-planned">
                      {draft !== undefined ? (
                        <span className="inline-flex flex-col items-end" onClick={(e) => e.stopPropagation()}>
                          {/* text (not number): comma-decimal typing must reach JS as text;
                              savePlan normalizes at the commit boundary. */}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft}
                            onChange={(e) => onDraftChange(cellKey, e.target.value)}
                            className="w-24 bg-surface-hover border border-border rounded-none px-2 py-1 font-mono text-xs tabular-nums text-text focus:ring-2 focus:ring-border-focus focus:outline-hidden"
                          />
                          {rowErrors[cellKey] && <span className="text-negative text-xs mt-0.5">{rowErrors[cellKey]}</span>}
                        </span>
                      ) : (
                        formatAmount(planned)
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-actual">{formatAmount(actual)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${(parseAmountNumber(remaining) ?? 0) < 0 ? 'text-negative' : 'text-remaining'}`}>
                      {formatAmount(remaining)}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-text-muted">{t('detail.noCategories')}</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-background border-t border-border">
                  {/* Same 9px label dialect as the thead (this page's
                      established register), not the canonical 10px tfoot
                      form - designer-sanctioned deviation. Sticky so the
                      label survives horizontal scroll like the header and
                      row identity cells; bg-background matches the tinted
                      footer row, not the bg-surface used above. */}
                  <td className="text-left px-4 py-2 sticky left-0 z-10 bg-background text-[9px] font-mono uppercase tracking-widest text-text-muted">
                    {totalLabel}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium tabular-nums text-planned">{formatAmount(totalPlanned)}</td>
                  <td className="px-4 py-2 text-right font-mono font-medium tabular-nums text-actual">{formatAmount(totalActual)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-medium tabular-nums ${totalRemainingNegative ? 'text-negative' : 'text-remaining'}`}>
                    {formatAmount(totalRemaining)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Mobile: summary card, then grouped category cards. The old
            3-column cards and the totals card are superseded - the summary
            card shows the same exact figures with ledger swatches. Also
            the period-swipe target: the only non-scrollable content region
            on this page (see periodStepDrag above). */}
        <div className="sm:hidden space-y-2 touch-pan-y" {...periodStepDrag}>
          {showCurrencyBand && !multiCurrency && (
            <div className="text-[9px] font-mono uppercase tracking-widest text-text-muted py-0.5">
              {currencySwitcher}
            </div>
          )}
          {rows.length > 0 && (
            <BudgetSummaryCard planned={totalPlanned} actual={totalActual} remaining={totalRemaining} />
          )}
          <BudgetCategoryList
            groups={phoneGroups}
            selectedCategory={selectedCategory}
            toggleSelected={toggleSelected}
            activeCurrency={activeCurrency}
            editDrafts={planDrafts}
            onDraftChange={onDraftChange}
            rowErrors={rowErrors}
          />
          {rows.length === 0 && (
            <div className="border border-border rounded-sm bg-surface px-4 py-6 text-center text-sm text-text-muted">
              {t('detail.noCategories')}
            </div>
          )}
        </div>
        </section>
      )}

      {editOpen && (
        /* Edit-plan footer: sticky over the scrolling page (class string
            from the FormPage exemplar - opaque bg so rows scroll beneath
            are masked, z-local stacking, phone bottom-nav clearance). Its
            keyboard-inset inline style is deliberately NOT copied: it
            belongs to FormPage's inner-scroll layout; this footer sits in
            the normally-scrolling page. Labels wrap, no fixed widths -
            Slavic strings run longer than English. */
        <div className="sticky bottom-0 max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 bg-surface border-t border-border pt-3 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap pb-3">
            <span className="text-xs text-text-muted tabular-nums">{t('detail.changedCount', { count: changedCount })}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={cancelEdit} disabled={isSavingPlan} className={secondaryButtonClass}>
                {t('detail.cancel')}
              </button>
              <button type="button" onClick={savePlan} disabled={isSavingPlan || changedCount === 0} className={primaryButtonClass}>
                {t('detail.savePlan')}
              </button>
            </div>
          </div>
        </div>
      )}

      {canWrite && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (newCategory.trim()) addCategory.mutate() }}
          className="mt-4 flex items-center gap-2 max-w-sm"
        >
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={t('detail.newCategoryPlaceholder')} className={inputClass} />
          <button type="submit" className={primaryButtonClass}><Plus size={13} /></button>
        </form>
      )}

      {canWrite && selectedCategoryObj && categories.length > 1 && (
        <button
          type="button"
          onClick={() => { setMergeSourceId(null); setMergeOpen(true) }}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors touch-hit"
        >
          <Merge size={13} /> {t('detail.mergeInto', { name: selectedCategoryObj.name })}
        </button>
      )}

      <Modal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        size="sm"
        className="p-6"
        title={t('detail.mergeTitle')}
      >
        <p className="text-xs text-text-muted -mt-3 mb-4">
          {t('detail.mergeBody', { name: selectedCategoryObj?.name })}
        </p>
        <div className="mb-4">
          <label className={labelClass}>{t('detail.mergeSourceLabel')}</label>
          <Select
            value={mergeSourceId}
            onChange={setMergeSourceId}
            options={categories
              .filter((c) => c.id !== selectedCategory)
              .map((c) => ({ value: c.id, label: c.name }))}
            placeholder={t('detail.selectCategoryPlaceholder')}
            aria-label={t('detail.mergeSourceLabel')}
            className="w-full"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setMergeOpen(false)} className={secondaryButtonClass}>
            {t('detail.cancel')}
          </button>
          <button
            type="button"
            onClick={() => { if (mergeSourceId != null) mergeCategory.mutate(mergeSourceId) }}
            disabled={mergeSourceId == null || mergeCategory.isPending}
            className={primaryButtonClass}
          >
            {mergeCategory.isPending ? t('detail.merging') : t('detail.merge')}
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

      {bookmarkModal && (
        <BookmarkFormModal
          budgetContext={bookmarkModal.mode === 'create'
            ? {
                budgetId,
                budgetName: budget?.name ?? '',
                currencyCode: activeCurrency,
              }
            : null}
          bookmark={bookmarkModal.mode === 'edit' ? bookmarkModal.bookmark : null}
          onClose={() => setBookmarkModal(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deletingPeriod}
        title={t('detail.deletePeriodDialog.title')}
        message={t('detail.deletePeriodDialog.message', { name: deletingPeriod?.name })}
        onConfirm={() => deletingPeriod && deletePeriod.mutate(deletingPeriod.id)}
        onCancel={() => setDeletingPeriod(null)}
        isPending={deletePeriod.isPending}
      />

      {/* Discard-changes confirm behind Cancel-with-changes and dirty
          period/currency switches (the unsavedChanges precedent in
          Transactions). Confirm runs the deferred proceed action. */}
      <ConfirmDialog
        isOpen={!!discardConfirm}
        title={t('detail.confirmCancelEdit.title')}
        message={discardConfirm?.message ?? ''}
        confirmLabel={t('detail.confirmCancelEdit.confirm')}
        destructive
        onConfirm={() => {
          setDiscardConfirm(null)
          discardConfirm?.proceed()
        }}
        onCancel={() => setDiscardConfirm(null)}
      />
    </div>
  )
}
