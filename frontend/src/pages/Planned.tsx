import { useEffect, useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Ban, CalendarClock, Copy, Download, Pause, Play, Plus, Pencil, Repeat, Trash2, CheckCircle } from 'lucide-react'
import { plannedTransactionsApi, recurringTransactionsApi, type PlannedTransactionOrdering } from '../api/client'
import type { PlannedTransaction, RecurringTransaction } from '../types'
import { useAccounts, useEnabledCurrencies, useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount, formatMonthYear } from '../utils/format'
import { runBlobExport } from '../utils/blobExport'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { amountParam, createUpdateParams, intListParam, intParam, useStalePageReset } from '../utils/params'
import { isCalendarMonth, monthRange, shiftMonth } from '../utils/dates'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import PlannedFormModal from '../components/modals/transactions/PlannedFormModal'
import RecurringFormModal from '../components/modals/transactions/RecurringFormModal'
import PlannedMonthStepper from '../components/transactions/PlannedMonthStepper'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'
import SegmentedControl from '../components/common/SegmentedControl'
import MultiSelect from '../components/common/MultiSelect'
import SearchInput from '../components/common/SearchInput'
import Select from '../components/common/Select'
import ListFilterFields from '../components/common/ListFilterFields'
import ListTotalsStrip from '../components/common/ListTotalsStrip'
import { FiltersToggle, FilterPanel, FilterField } from '../components/common/FilterBar'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-warning border-warning/40',
  done: 'text-positive border-positive/40',
  cancelled: 'text-text-muted border-border',
}

type StatusFilter = 'all' | 'pending' | 'done' | 'cancelled'

// Option arrays carry keys only: values are wire enums (URL ?status=/,
// ?ordering=, API payloads) and never translate; labels resolve through t()
// inside the component.
const STATUS_OPTIONS = [
  { value: 'all', labelKey: 'status.all' },
  { value: 'pending', labelKey: 'status.pending' },
  { value: 'done', labelKey: 'status.done' },
  { value: 'cancelled', labelKey: 'status.cancelled' },
] as const

// Curated sort options; the backend's ORDERING_PATTERN allows more, but the
// Select only offers what reads well in a divider-row list.
const SORT_OPTIONS = [
  { value: 'planned_date', labelKey: 'sort.soonest' },
  { value: '-planned_date', labelKey: 'sort.latest' },
  { value: '-amount', labelKey: 'sort.amountDesc' },
  { value: 'amount', labelKey: 'sort.amountAsc' },
  { value: 'name', labelKey: 'sort.name' },
] as const

// The backend's default when no ?ordering= is sent: picking it clears the
// param so the URL stays clean for the common case.
const DEFAULT_SORT: PlannedTransactionOrdering = 'planned_date'

// Last committed search term, remembered across visits. The URL ?search= param
// always wins over the stored value.
const SEARCH_STORAGE_KEY = 'owlgarth_planned_search'

function readStoredSearch(): string {
  try {
    return localStorage.getItem(SEARCH_STORAGE_KEY) ?? ''
  } catch {
    // Storage unavailable (private mode): remembering is best-effort.
    return ''
  }
}

export default function Planned() {
  const { t } = useTranslation('planned')
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const { data: accounts = [] } = useAccounts(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  const isTouch = useIsTouch()

  const statusOptions = STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
  const sortOptions = SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
  const statusLabel = (value: StatusFilter) => t(STATUS_OPTIONS.find((o) => o.value === value)!.labelKey)

  // Schedule summary for the recurring meta line: "Every month on day 5",
  // "Every 2 weeks". Plural forms resolve via the i18next count; the
  // day-of-month renders only for monthly (derived from start_date; the
  // backend clamps short months, so the 31st shows the stored day).
  const scheduleSummary = (r: RecurringTransaction): string => {
    if (r.interval_kind === 'monthly') {
      return t('recurring.schedule.monthly', { count: r.interval_count, day: Number(r.start_date.slice(8, 10)) })
    }
    return r.interval_kind === 'weekly'
      ? t('recurring.schedule.weekly', { count: r.interval_count })
      : t('recurring.schedule.daily', { count: r.interval_count })
  }

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PlannedTransaction | null>(null)
  const [copySource, setCopySource] = useState<PlannedTransaction | null>(null)
  const [deleting, setDeleting] = useState<PlannedTransaction | null>(null)
  // Cancel confirms like delete: there is no un-cancel in the UI, so a stray
  // click on the hover-revealed Ban icon must not fire the mutation directly.
  const [cancelling, setCancelling] = useState<PlannedTransaction | null>(null)

  // Recurring view state. Mirrors the planned modal-state quartet above.
  const [recurringFormOpen, setRecurringFormOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<RecurringTransaction | null>(null)
  const [adoptSource, setAdoptSource] = useState<PlannedTransaction | null>(null)
  const [deletingRule, setDeletingRule] = useState<RecurringTransaction | null>(null)
  // Switch state for the delete dialog's "also delete pending rows" row; reset
  // on every open so a previous session's toggle never leaks into the next.
  const [deleteRulePending, setDeleteRulePending] = useState(false)
  // Touch replacements for the two hover action groups (TransfersPage pattern).
  const [plannedRowAction, setPlannedRowAction] = useState<PlannedTransaction | null>(null)
  const [recurringRowAction, setRecurringRowAction] = useState<RecurringTransaction | null>(null)

  const openNew = () => { setEditing(null); setCopySource(null); setFormOpen(true) }
  const openEdit = (p: PlannedTransaction) => { setEditing(p); setCopySource(null); setFormOpen(true) }
  // Copy = new-planned form prefilled from p, date reset to today. Also
  // reachable from inside the edit modal, which then morphs into copy mode.
  const openCopy = (p: PlannedTransaction) => { setEditing(null); setCopySource(p); setFormOpen(true) }
  const openNewRecurring = () => { setEditingRule(null); setAdoptSource(null); setRecurringFormOpen(true) }
  const openEditRule = (r: RecurringTransaction) => { setEditingRule(r); setAdoptSource(null); setRecurringFormOpen(true) }
  // "Make recurring": the modal prefills from the pending row and adopts it as
  // the rule's first occurrence (adopt_planned_id) - no duplicate row is created.
  const openMakeRecurring = (p: PlannedTransaction) => { setEditingRule(null); setAdoptSource(p); setRecurringFormOpen(true) }
  const openDeleteRule = (r: RecurringTransaction) => { setDeleteRulePending(false); setDeletingRule(r) }

  // Filter state lives in the URL: shareable, bookmarkable, back-button friendly.
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStatus = searchParams.get('status')
  const statusFilter: StatusFilter = STATUS_OPTIONS.some((o) => o.value === rawStatus)
    ? (rawStatus as StatusFilter)
    : 'all'
  // View tab lives in the URL (?view=planned|recurring, default planned):
  // shareable like every other filter, and picking the default clears the
  // param so the common-case URL stays clean (status-filter idiom).
  const rawView = searchParams.get('view')
  const view: 'planned' | 'recurring' = rawView === 'recurring' ? 'recurring' : 'planned'
  // Remembered search: when the URL carries no ?search= param (fresh visit),
  // the last committed term fills the box. Seeded once at mount (the lazy
  // useState initializer reads storage exactly once); after that the URL
  // param is the single source of truth.
  const [restoredSearch, setRestoredSearch] = useState(() =>
    searchParams.get('search') === null ? readStoredSearch() : '',
  )
  const search = searchParams.get('search') ?? restoredSearch
  const accountFilter = intListParam(searchParams, 'account')
  const budgetFilter = intListParam(searchParams, 'budget')
  const categoryFilter = intListParam(searchParams, 'category')
  // Filters by ACCOUNT currency - the account a plan books into, never the
  // informational original-amount facet.
  const enabledCodes = new Set(currencies.map((c) => c.code))
  // URL param is a CSV of codes; unknown/stale entries drop (type-filter idiom).
  const currencyFilter = (searchParams.get('currency') ?? '')
    .split(',')
    .filter((c) => enabledCodes.has(c))
  const amountMin = searchParams.get('amount_min') ?? ''
  const amountMax = searchParams.get('amount_max') ?? ''
  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')
  // Default month: the planned view focuses the current calendar month on a
  // fresh visit. All reads below (list, totals, export, filter count) use
  // the EFFECTIVE range: explicit params win; both absent falls back to the
  // session default; a PARTIAL range (one bound) passes through as-is - the
  // missing bound is never auto-filled. ListFilterFields keeps reading the
  // RAW params (self-contained contract): before materialization the panel
  // is closed so no mismatch is visible, after it raw == effective.
  // Session default, restoredSearch pattern: the lazy initializer reads the
  // URL exactly once - a mount WITH any date param (full or partial deep
  // link) never defaults. Consumed - never re-applies - once any date param
  // has been present, so after materialization (or a deep link) clearing
  // the params means the user's explicit All time, not a re-default.
  const [dateDefault, setDateDefault] = useState(() =>
    rawFrom === null && rawTo === null ? monthRange(new Date().getFullYear(), new Date().getMonth()) : null,
  )
  // Derived-until-touched consume (render-adjust on LOCAL state - the
  // sanctioned shape; never an effect, never router state). The set lands
  // on null which disproves its own guard, so the adjust terminates by
  // construction; it is a fall-through, keeping every hook below
  // unconditional, and on the pass where it fires the params already win
  // the derivations, so no query key churns.
  if (dateDefault && (rawFrom !== null || rawTo !== null)) setDateDefault(null)
  const dateFrom = rawFrom ?? dateDefault?.from ?? ''
  const dateTo = rawTo ?? dateDefault?.to ?? ''
  const page = intParam(searchParams, 'page') ?? 1
  // Garbage ?ordering= values read as unset (status-filter idiom): the Select
  // shows the default placeholder and the request sends nothing.
  const rawOrdering = searchParams.get('ordering')
  const ordering = SORT_OPTIONS.some((o) => o.value === rawOrdering) ? (rawOrdering as PlannedTransactionOrdering) : null

  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [isExporting, setIsExporting] = useState(false)

  const updateParams = createUpdateParams(setSearchParams)

  // One-shot month materialization (useStalePageReset shape: the URL write
  // goes through the closure-wrapped updateParams, never setSearchParams
  // directly - the shipped precedent for a no-event URL write from an
  // effect; a render-adjust must not write router state). Fires only while
  // the session default is live: entering the planned view with no date
  // param writes the current month into the URL (replace, no history
  // entry; createUpdateParams also drops ?page). The consume adjust above
  // then kills the default, so All time / Clear filters / deep links never
  // re-default within a session; a fresh mount re-initializes (accepted).
  // view in the deps: a recurring -> planned tab switch materializes too.
  useEffect(() => {
    if (view !== 'planned' || !dateDefault || rawFrom !== null || rawTo !== null) return
    updateParams({ from: dateDefault.from, to: dateDefault.to })
  }, [view, dateDefault, rawFrom, rawTo, updateParams])

  // Any manual search interaction drops the restored hint and remembers the
  // new term; clearing the box stores '' so the old term can never re-apply.
  const handleSearchChange = (next: string) => {
    setRestoredSearch('')
    try {
      localStorage.setItem(SEARCH_STORAGE_KEY, next)
    } catch {
      // Storage unavailable: remembering is best-effort.
    }
    updateParams({ search: next || null })
  }

  // The export endpoint honors ONLY the status and date-range filters - never
  // imply the whole filter panel applies to the file.
  const handleExportView = async () => {
    setIsExporting(true)
    // runBlobExport never throws; it owns every export toast.
    await runBlobExport(
      () => plannedTransactionsApi.exportView({
        status: statusFilter === 'all' ? undefined : statusFilter,
        start_date: dateFrom || undefined,
        end_date: dateTo || undefined,
      }),
      {
        filename: `planned_${dateFrom || 'all'}_${dateTo || 'all'}.json`,
        loadingMessage: t('preparingExport'),
        successMessage: t('exportComplete'),
        errorMessage: t('exportFailed'),
      },
    )
    setIsExporting(false)
  }

  // Each facet counts once, however many values it holds.
  const activeFilterCount = [
    accountFilter.length > 0,
    budgetFilter.length > 0,
    categoryFilter.length > 0,
    currencyFilter.length > 0,
    Boolean(amountMin || amountMax),
    Boolean(dateFrom || dateTo),
  ].filter(Boolean).length

  // Exact-calendar-month detection on the EFFECTIVE range: truthy only when
  // from/to are a calendar month's first and last day. The month label and
  // the month-aware empty state below key off it.
  const exactMonth = isCalendarMonth(dateFrom, dateTo)
  const monthLabel = exactMonth ? formatMonthYear(dateFrom) : null
  // The date facet is the ONLY filter and it is an exact month - ANY month,
  // the default or one the user arrived at: the generic "filtered" empty
  // message would be misleading, the empty state gets the month treatment.
  const onlyMonthRange = activeFilterCount === 1 && !!exactMonth

  // Deep links with filters land with the panel already open - except a
  // range equal to the default month (fresh visit pre-materialization, or
  // a deep link to exactly the current month): that IS the default view,
  // badge 1, panel closed. Any other range - partial, custom, a different
  // exact month - still auto-opens. First render only (useState
  // initializer): the later materialization write cannot flip it.
  const defRange = monthRange(new Date().getFullYear(), new Date().getMonth())
  const [filtersOpen, setFiltersOpen] = useState(
    activeFilterCount > 0 && !(activeFilterCount === 1 && dateFrom === defRange.from && dateTo === defRange.to),
  )
  const filterPanelId = useId()

  const clearFilters = () =>
    updateParams({ account: null, budget: null, category: null, currency: null, amount_min: null, amount_max: null, from: null, to: null })

  // Month stepper: step to the adjacent calendar month. The target computes
  // from exactMonth (the range on screen), NEVER from "today" - December
  // 2026's next is January 2027. shiftMonth's monthRange core rolls
  // out-of-range months by construction (Date math), so no boundary
  // branching. No special page clearing: createUpdateParams deletes 'page'
  // on any patch that does not set it, and useStalePageReset reconciles a
  // now-out-of-range page.
  const handleMonthShift = (delta: number) => {
    if (!exactMonth) return
    updateParams(shiftMonth(exactMonth, delta))
  }

  const { data, isLoading } = useQuery({
    queryKey: ['planned', statusFilter, page, pageSize, ordering, search, accountFilter.join(','), currencyFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo],
    queryFn: () =>
      plannedTransactionsApi.getAll({
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        page_size: pageSize,
        search: search || undefined,
        account_id: accountFilter.length ? accountFilter : undefined,
        currency_code: currencyFilter.length ? currencyFilter : undefined,
        budget_id: budgetFilter.length ? budgetFilter : undefined,
        category_id: categoryFilter.length ? categoryFilter : undefined,
        amount_gte: amountParam(amountMin),
        amount_lte: amountParam(amountMax),
        start_date: dateFrom || undefined,
        end_date: dateTo || undefined,
        ordering: ordering || undefined,
      }),
    // Previous page stays rendered while the next one loads — no skeleton
    // flash on page/filter changes (v5 placeholderData pattern).
    placeholderData: keepPreviousData,
  })

  // A stale ?page= beyond the (possibly shrunken) range resets to page 1 once
  // the response lands; the backend serves the clamped page meanwhile.
  useStalePageReset(page, data, updateParams)

  const items = data?.items ?? []

  // Keyed INSIDE the ['planned'] family so every existing invalidation of that
  // prefix (form modal, execute, cancel, delete) refetches the strip too.
  // Same dependency values as the list query minus page/pageSize/ordering -
  // currency_code included: the totals route accepts the same currency
  // params the list route does.
  const { data: totalsData, isLoading: totalsIsLoading } = useQuery({
    queryKey: ['planned', 'totals', statusFilter, search, accountFilter.join(','), currencyFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo],
    queryFn: () =>
      plannedTransactionsApi.getTotals({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
        account_id: accountFilter.length ? accountFilter : undefined,
        currency_code: currencyFilter.length ? currencyFilter : undefined,
        budget_id: budgetFilter.length ? budgetFilter : undefined,
        category_id: categoryFilter.length ? categoryFilter : undefined,
        amount_gte: amountParam(amountMin),
        amount_lte: amountParam(amountMax),
        start_date: dateFrom || undefined,
        end_date: dateTo || undefined,
        group_by: 'currency',
      }),
  })

  // Both active AND paused rules are visible (paused chip + resume action), so
  // the list always requests include_inactive. Fetched only in the recurring
  // view: the planned view needs no rule data (recurring_id drives the badge).
  const { data: recurringRules = [], isLoading: recurringIsLoading } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringTransactionsApi.getAll(true),
    enabled: view === 'recurring',
  })

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  const executeMutation = useMutation({
    mutationFn: (p: PlannedTransaction) => plannedTransactionsApi.execute(p.id, new Date().toISOString().slice(0, 10)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success(t('executed'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('executeFailed'))),
  })

  // Cancel keeps the row (status → cancelled) — softer than delete. PUT wants
  // the full payload, so echo the row's fields with only the status changed.
  const cancelMutation = useMutation({
    mutationFn: (p: PlannedTransaction) =>
      plannedTransactionsApi.update(p.id, {
        name: p.name,
        amount: p.amount,
        account_id: p.account_id,
        currency_code: p.currency_code,
        category_id: p.category_id,
        planned_date: p.planned_date,
        status: 'cancelled',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(t('cancelledToast'))
      setCancelling(null)
    },
    onError: (error) => { toast.error(getApiErrorMessage(error, t('cancelFailed'))); setCancelling(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plannedTransactionsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['planned'] }); toast.success(t('deleted')); setDeleting(null) },
    onError: (error) => { toast.error(getApiErrorMessage(error, t('deleteFailed'))); setDeleting(null) },
  })

  // Pause/resume: full-replace PUT, so echo the row's fields with only
  // is_active flipped (the cancelMutation echo pattern). Planned rows never
  // change here, so only ['recurring'] refetches.
  const toggleActiveMutation = useMutation({
    mutationFn: (r: RecurringTransaction) =>
      recurringTransactionsApi.update(r.id, {
        name: r.name,
        amount: r.amount,
        account_id: r.account_id,
        currency_code: r.currency_code,
        category_id: r.category_id,
        interval_kind: r.interval_kind,
        interval_count: r.interval_count,
        start_date: r.start_date,
        upfront_count: r.upfront_count,
        materialize_all: r.materialize_all,
        end_date: r.end_date,
        is_active: !r.is_active,
      }),
    onSuccess: (_, r) => {
      queryClient.invalidateQueries({ queryKey: ['recurring'] })
      toast.success(r.is_active ? t('recurring.pausedToast') : t('recurring.resumedToast'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('recurring.updateFailed'))),
  })

  const deleteRuleMutation = useMutation({
    mutationFn: (input: { id: number; deletePending: boolean }) =>
      recurringTransactionsApi.delete(input.id, input.deletePending),
    onSuccess: () => {
      // delete_pending can remove planned rows, so both lists refetch.
      queryClient.invalidateQueries({ queryKey: ['recurring'] })
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(t('recurring.deleted'))
      setDeletingRule(null)
    },
    onError: (error) => { toast.error(getApiErrorMessage(error, t('recurring.deleteFailed'))); setDeletingRule(null) },
  })

  return (
    <div className="p-6 max-sm:p-0 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">{t('title')}</h1>
        <div className="flex items-center gap-2">
          {/* Visible on mobile too: export is a read action with no FAB twin. */}
          <button
            type="button"
            onClick={handleExportView}
            disabled={isExporting}
            title={t('exportTitle')}
            className={secondaryButtonClass}
          >
            <Download size={13} className="inline mr-1" /> {t('exportView')}
          </button>
          {/* Hidden on mobile: the FAB quick-add owns creation there. */}
          {canWrite && (
            <button type="button" onClick={view === 'recurring' ? openNewRecurring : openNew} className={`${primaryButtonClass} max-sm:hidden`}>
              <Plus size={13} className="inline mr-1" /> {view === 'recurring' ? t('recurring.newRecurring') : t('newPlanned')}
            </button>
          )}
        </div>
      </div>

      {/* View switch sits directly below the header, ABOVE the status
          control: it swaps the whole page surface. */}
      <div className="mb-3">
        <SegmentedControl
          value={view}
          onChange={(v) => updateParams({ view: v === 'planned' ? null : v })}
          options={[
            { value: 'planned', label: t('recurring.tabPlanned') },
            { value: 'recurring', label: t('recurring.tabRecurring') },
          ]}
          aria-label={t('recurring.viewAria')}
        />
      </div>

      {/* Month window above the status control (scope nesting: view picks
          the surface, month scopes the dataset, status narrows within).
          Rendered only when the effective range is an exact calendar month:
          custom/partial ranges and All time hide the whole row. The label
          null check narrows the string prop; it is non-null exactly when
          exactMonth is. */}
      {view === 'planned' && exactMonth && monthLabel !== null && (
        <PlannedMonthStepper label={monthLabel} onShift={handleMonthShift} />
      )}

      {view === 'planned' && (
        <div className="mb-3">
          <SegmentedControl
            value={statusFilter}
            onChange={(v) => updateParams({ status: v === 'all' ? null : v })}
            options={statusOptions}
            aria-label={t('statusAria')}
          />
        </div>
      )}

      {view === 'planned' && (
      <div className="flex gap-2 mb-3">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAria')}
          className="flex-1 max-w-sm max-sm:max-w-none"
        />
        <FiltersToggle open={filtersOpen} count={activeFilterCount} onToggle={() => setFiltersOpen((v) => !v)} aria-controls={filterPanelId} />
        <Select
          value={ordering}
          onChange={(v) => updateParams({ ordering: v === DEFAULT_SORT ? null : v })}
          options={sortOptions}
          placeholder={t('sort.soonest')}
          aria-label={t('sortAria')}
          className="w-48 flex-shrink-0"
        />
      </div>
      )}

      {view === 'planned' && filtersOpen && (
        <FilterPanel id={filterPanelId} onClear={activeFilterCount > 0 ? clearFilters : null}>
          {accounts.length > 1 && (
            <FilterField label={t('filters.account')}>
              <MultiSelect values={accountFilter} onChange={(v) => updateParams({ account: v })} options={accountOptions} placeholder={t('filters.allAccounts')} aria-label={t('filters.byAccountAria')} className="w-full" />
            </FilterField>
          )}
          {multiCurrency && (
            <FilterField label={t('filters.currency')}>
              <MultiSelect
                values={currencyFilter}
                onChange={(v) => updateParams({ currency: v })}
                options={currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
                placeholder={t('filters.allCurrencies')}
                aria-label={t('filters.byCurrencyAria')}
                className="w-full"
              />
            </FilterField>
          )}
          <ListFilterFields dateLabel={t('filters.plannedDate')} />
        </FilterPanel>
      )}

      {/* Hidden while the list itself is unknown/empty: no rows, no totals. */}
      {view === 'planned' && (data?.total ?? 0) > 0 && (
        <ListTotalsStrip
          caption={t('totals.caption', { count: data?.total ?? 0 })}
          items={totalsData?.totals ?? []}
          tone={() => 'neutral'}
          isLoading={totalsIsLoading}
        />
      )}

      {view === 'planned' ? (
        isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-surface-muted rounded-sm animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          search || (activeFilterCount > 0 && !onlyMonthRange) ? (
            <p className="text-sm text-text-muted">{t('emptyFiltered')}</p>
          ) : statusFilter !== 'all' ? (
            <p className="text-sm text-text-muted">{t('emptyWithStatus', { status: statusLabel(statusFilter) })}</p>
          ) : exactMonth ? (
            <EmptyState
              icon={<CalendarClock size={48} strokeWidth={1.5} className="text-text-muted/30" />}
              heading={<span className="font-mono">{monthLabel}</span>}
              message={t('emptyMonth.message')}
              action={{ label: t('emptyMonth.showAll'), onClick: () => updateParams({ from: null, to: null }) }}
            />
          ) : (
            <p className="text-sm text-text-muted">{t('empty')}</p>
          )
        ) : (
          <div className="border border-border rounded-sm bg-surface divide-y divide-border">
            {items.map((p) => (
              <div
                key={p.id}
                {...(isTouch && canWrite ? tappableProps(() => setPlannedRowAction(p)) : {})}
                className={`flex items-center justify-between px-4 py-3 text-sm group ${
                  isTouch && canWrite ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-text truncate">{p.name}</span>
                    <span className={`text-[9px] font-mono uppercase tracking-wider border rounded-sm px-1 ${STATUS_STYLE[p.status]}`}>{statusLabel(p.status)}</span>
                    {p.recurring_id != null && (
                      <span className="text-text-muted" title={t('recurring.badge')}>
                        <Repeat size={12} className="inline" aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">
                    {p.planned_date}{p.category?.name ? ` · ${p.category.name}` : ''} · {p.account_name ?? t('noAccount')}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                  <span className="font-mono text-text whitespace-nowrap">{formatAmount(p.amount)} {multiCurrency ? p.currency_code : ''}</span>
                  {/* Hover reveals are pointer-fine only - on touch the row tap
                      opens the action sheet instead. */}
                  {canWrite && !isTouch && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.status === 'pending' && (
                        <button onClick={() => executeMutation.mutate(p)} className="text-text-muted hover:text-positive p-1" title={t('rowActions.execute')}><CheckCircle size={13} /></button>
                      )}
                      {p.status === 'pending' && (
                        <button onClick={() => setCancelling(p)} className="text-text-muted hover:text-warning p-1" title={t('rowActions.cancelPlan')}><Ban size={13} /></button>
                      )}
                      {p.status === 'pending' && p.recurring_id == null && (
                        <button type="button" onClick={() => openMakeRecurring(p)} title={t('recurring.makeRecurring')} aria-label={t('recurring.makeRecurring')} className="text-text-muted hover:text-text p-1"><Repeat size={13} /></button>
                      )}
                      <button onClick={() => openEdit(p)} title={t('rowActions.edit')} className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                      <button onClick={() => openCopy(p)} title={t('rowActions.copy')} className="text-text-muted hover:text-text p-1"><Copy size={13} /></button>
                      <button onClick={() => setDeleting(p)} title={t('rowActions.delete')} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {data && data.total > 0 && (
              <Pagination
                page={data.page}
                total_pages={data.total_pages}
                total={data.total}
                page_size={data.page_size}
                onPageChange={(p) => updateParams({ page: p })}
                onPageSizeChange={(s) => { setPageSize(s); setStoredPageSize(s); updateParams({ page: null }) }}
              />
            )}
          </div>
        )
      ) : recurringIsLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : recurringRules.length === 0 ? (
        <p className="text-sm text-text-muted">{t('recurring.empty')}</p>
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {recurringRules.map((r) => (
            <div
              key={r.id}
              {...(isTouch && canWrite ? tappableProps(() => setRecurringRowAction(r)) : {})}
              className={`flex items-center justify-between px-4 py-3 text-sm group ${
                isTouch && canWrite ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-text truncate">{r.name}</span>
                  <span className={`text-[9px] font-mono uppercase tracking-wider border rounded-sm px-1 ${r.is_active ? 'text-positive border-positive/40' : 'text-text-muted border-border'}`}>
                    {r.is_active ? t('recurring.activeChip') : t('recurring.pausedChip')}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-text-muted truncate">
                  {scheduleSummary(r)}{r.next_occurrence_date ? ` · ${r.next_occurrence_date}` : ''}{r.category?.name ? ` · ${r.category.name}` : ''} · {r.account_name ?? t('noAccount')}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                <span className="font-mono text-text whitespace-nowrap">{formatAmount(r.amount)} {multiCurrency ? r.currency_code : ''}</span>
                {/* Hover reveals are pointer-fine only - on touch the row tap
                    opens the action sheet instead. */}
                {canWrite && !isTouch && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => openEditRule(r)} title={t('recurring.rowActions.edit')} aria-label={t('recurring.rowActions.edit')} className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                    <button type="button" onClick={() => toggleActiveMutation.mutate(r)} title={r.is_active ? t('recurring.rowActions.pause') : t('recurring.rowActions.resume')} aria-label={r.is_active ? t('recurring.rowActions.pause') : t('recurring.rowActions.resume')} className="text-text-muted hover:text-text p-1">
                      {r.is_active ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button type="button" onClick={() => openDeleteRule(r)} title={t('recurring.rowActions.delete')} aria-label={t('recurring.rowActions.delete')} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PlannedFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        planned={editing}
        copyFrom={copySource}
        onCopy={openCopy}
        onDelete={(p) => { setFormOpen(false); setDeleting(p) }}
        onExecute={(p) => { setFormOpen(false); executeMutation.mutate(p) }}
        onCancelPlan={(p) => { setFormOpen(false); setCancelling(p) }}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        title={t('deleteDialog.title')}
        message={t('deleteDialog.message', { name: deleting?.name })}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        isOpen={!!cancelling}
        title={t('cancelDialog.title')}
        message={t('cancelDialog.message', { name: cancelling?.name })}
        confirmLabel={t('cancelDialog.confirm')}
        isPending={cancelMutation.isPending}
        onConfirm={() => cancelling && cancelMutation.mutate(cancelling)}
        onCancel={() => setCancelling(null)}
      />
      <RecurringFormModal
        open={recurringFormOpen}
        onClose={() => setRecurringFormOpen(false)}
        recurring={editingRule}
        fromPlanned={adoptSource}
        onDelete={(r) => { setRecurringFormOpen(false); openDeleteRule(r) }}
      />
      <ConfirmDialog
        isOpen={!!deletingRule}
        title={t('recurring.deleteDialog.title')}
        message={t('recurring.deleteDialog.message', { name: deletingRule?.name })}
        optionalSwitch={deletingRule ? {
          label: t('recurring.deleteDialog.deletePending', { count: deletingRule?.pending_planned_count ?? 0 }),
          checked: deleteRulePending,
          onChange: setDeleteRulePending,
        } : undefined}
        isPending={deleteRuleMutation.isPending}
        onConfirm={() => deletingRule && deleteRuleMutation.mutate({ id: deletingRule.id, deletePending: deleteRulePending })}
        onCancel={() => setDeletingRule(null)}
      />
      {/* Touch replacement for the planned rows' hover actions (previously
          the row tapped straight into edit). */}
      <ActionSheet
        open={!!plannedRowAction}
        onClose={() => setPlannedRowAction(null)}
        title={plannedRowAction?.name}
        actions={[
          { label: t('rowActions.edit'), icon: Pencil, onSelect: () => plannedRowAction && openEdit(plannedRowAction) },
          ...(plannedRowAction && plannedRowAction.status === 'pending' && plannedRowAction.recurring_id == null
            ? [{ label: t('recurring.makeRecurring'), icon: Repeat, onSelect: () => openMakeRecurring(plannedRowAction) }]
            : []),
          ...(plannedRowAction?.status === 'pending'
            ? [
                { label: t('rowActions.execute'), icon: CheckCircle, onSelect: () => plannedRowAction && executeMutation.mutate(plannedRowAction) },
                { label: t('rowActions.cancelPlan'), icon: Ban, onSelect: () => plannedRowAction && setCancelling(plannedRowAction) },
              ]
            : []),
          { label: t('rowActions.delete'), icon: Trash2, destructive: true, onSelect: () => plannedRowAction && setDeleting(plannedRowAction) },
        ]}
      />
      <ActionSheet
        open={!!recurringRowAction}
        onClose={() => setRecurringRowAction(null)}
        title={recurringRowAction?.name}
        actions={[
          { label: t('recurring.rowActions.edit'), icon: Pencil, onSelect: () => recurringRowAction && openEditRule(recurringRowAction) },
          {
            label: recurringRowAction?.is_active ? t('recurring.rowActions.pause') : t('recurring.rowActions.resume'),
            icon: recurringRowAction?.is_active ? Pause : Play,
            onSelect: () => recurringRowAction && toggleActiveMutation.mutate(recurringRowAction),
          },
          { label: t('recurring.rowActions.delete'), icon: Trash2, destructive: true, onSelect: () => recurringRowAction && openDeleteRule(recurringRowAction) },
        ]}
      />
    </div>
  )
}
