import { useEffect, useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BookmarkPlus, Copy, Download, Plus, Pencil, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { transactionsApi, type TransactionOrdering } from '../api/client'
import type { Transaction, UserWorkspaceSettings } from '../types'
import { useAccounts, useEnabledCurrencies, useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from '../hooks/useWorkspaceSettings'
import { formatAmount } from '../utils/format'
import { runBlobExport } from '../utils/blobExport'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { amountParam, createUpdateParams, intListParam, intParam, useStalePageReset } from '../utils/params'
import { buildDefaultsLatch, capturePageDefaults } from '../utils/pageDefaults'
import { paramsFromSearchParams } from '../utils/bookmarks'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import BookmarkFormModal from '../components/modals/bookmarks/BookmarkFormModal'
import TransactionFormModal from '../components/modals/transactions/TransactionFormModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Pagination from '../components/common/Pagination'
import MultiSelect from '../components/common/MultiSelect'
import SearchInput from '../components/common/SearchInput'
import Select from '../components/common/Select'
import ListFilterFields from '../components/common/ListFilterFields'
import ListTotalsStrip from '../components/common/ListTotalsStrip'
import { FiltersToggle, FilterPanel, FilterField } from '../components/common/FilterBar'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

const TYPE_STYLE: Record<string, string> = {
  income: 'text-positive',
  expense: 'text-negative',
  adjustment: 'text-warning',
}

const TYPE_OPTIONS = [
  { value: 'income', labelKey: 'type.income' },
  { value: 'expense', labelKey: 'type.expense' },
  { value: 'adjustment', labelKey: 'type.adjustment' },
] as const

// Curated sort options; the backend's ORDERING_PATTERN allows more, but the
// Select only offers what reads well in a divider-row list.
const SORT_OPTIONS = [
  { value: '-date', labelKey: 'sort.newest' },
  { value: 'date', labelKey: 'sort.oldest' },
  { value: '-amount', labelKey: 'sort.amountDesc' },
  { value: 'amount', labelKey: 'sort.amountAsc' },
  { value: 'description', labelKey: 'sort.description' },
] as const

// The backend's default when no ?ordering= is sent: picking it clears the
// param so the URL stays clean for the common case.
const DEFAULT_SORT: TransactionOrdering = '-date'

// Last committed search term, remembered across visits. The URL ?search= param
// always wins over the stored value.
const SEARCH_STORAGE_KEY = 'owlgarth_tx_search'

function readStoredSearch(): string {
  try {
    return localStorage.getItem(SEARCH_STORAGE_KEY) ?? ''
  } catch {
    // Storage unavailable (private mode): remembering is best-effort.
    return ''
  }
}

// Arrival gate + page shell. The per-page defaults must resolve before the
// content mounts: a cold-cache materialization of built-ins would flip every
// control a moment later. Both gate queries are boot-time fetches with a
// staleTime, so warm by the time users reach the page - the gate binds on
// cold cache and workspace switch only. An errored settings query opens the
// gate with settings undefined and the content degrades to the page
// built-ins (pageDefaults normalizes undefined to all-null) rather than
// blocking the page.
export default function Transactions() {
  const { t } = useTranslation('transactions')
  const [searchParams] = useSearchParams()
  const { canWrite } = usePermissions()
  const { data: settings, isLoading: settingsLoading } = useWorkspaceSettings()
  const { isLoading: preferencesLoading, calendarStartDay } = useUserPreferences()
  const defaultsLoading = settingsLoading || preferencesLoading

  const [isExporting, setIsExporting] = useState(false)
  // Skeleton delay: a skeleton flashing for a fast cache hit is its own
  // banned pattern, so the pulse shows only after the load has visibly
  // stalled. The setter lives ONLY inside the timer callback (a synchronous
  // set in the effect body would trip set-state-in-effect); the reset when
  // the gate reopens is the fall-through adjust below.
  const [skeletonShown, setSkeletonShown] = useState(false)
  useEffect(() => {
    if (!defaultsLoading) return
    const timer = setTimeout(() => setSkeletonShown(true), 300)
    return () => clearTimeout(timer)
  }, [defaultsLoading])

  // Header New click crosses the component boundary: the button lives here
  // (above the gate) while the form modal and its seed state live in the
  // content. A plain counter the content consumes with a render-adjust.
  const [createRequest, setCreateRequest] = useState(0)

  // Fall-through reset of the skeleton flag (lands on false, which disproves
  // its own guard - terminates by construction; StrictMode-idempotent).
  if (!defaultsLoading && skeletonShown) setSkeletonShown(false)

  // Export reads the URL at click time instead of threading the content's
  // effective derivations across the boundary: the URL is the source of
  // truth once the defaults have materialized into it. Tradeoff: a click
  // inside the brief cold-cache gate window exports all-time / no type -
  // a benign degradation; every click after materialization matches the
  // on-screen view. Single-type semantics preserved verbatim: only a single
  // selected type narrows the file - a multi-type selection (a materialized
  // income+expense default, or a hand-set ?type=income,expense) sends NO
  // type, exactly what today's handler does with a 2+ entry list.
  const handleExportView = async () => {
    setIsExporting(true)
    // runBlobExport never throws; it owns every export toast.
    const rawType = searchParams.get('type')
    const exportType = rawType === null ? [] : rawType.split(',').filter((v) => TYPE_OPTIONS.some((o) => o.value === v))
    const from = searchParams.get('from') ?? ''
    const to = searchParams.get('to') ?? ''
    await runBlobExport(
      () => transactionsApi.exportView({
        date_from: from || undefined,
        date_to: to || undefined,
        transaction_type: exportType.length === 1 ? exportType[0] : undefined,
      }),
      {
        filename: `transactions_${from || 'all'}_${to || 'all'}.json`,
        loadingMessage: t('preparingExport'),
        successMessage: t('exportComplete'),
        errorMessage: t('exportFailed'),
      },
    )
    setIsExporting(false)
  }

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      {/* The h1 and the action row stay mounted through the gate: route
          changes move focus to the page h1, and a header that pops in
          after the gate is churn. The gated region is everything below. */}
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
            <button
              type="button"
              onClick={() => setCreateRequest((n) => n + 1)}
              className={`${primaryButtonClass} max-sm:hidden`}
            >
              <Plus size={13} className="inline mr-1" /> {t('newTransaction')}
            </button>
          )}
        </div>
      </div>

      {defaultsLoading ? (
        // Under the 300ms threshold the gated region simply holds - a blank
        // beat is imperceptible, a skeleton flash is the anti-pattern. The
        // skeleton shapes approximate the control row the defaults feed
        // (search / filters toggle / bookmark / save / sort) plus the page's
        // own list-row idiom.
        skeletonShown ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-9 bg-surface-muted rounded-sm animate-pulse" />
            <div className="space-y-2 pt-1">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}
            </div>
          </div>
        ) : null
      ) : (
        <TransactionsContent settings={settings} calendarStartDay={calendarStartDay} createRequest={createRequest} />
      )}
    </div>
  )
}

interface TransactionsContentProps {
  /** Member-settings blob resolved by the arrival gate; undefined only when
      the settings query errored (built-ins apply). */
  settings: UserWorkspaceSettings | undefined
  /** Calendar start day (1 = Monday .. 7 = Sunday) for the week default. */
  calendarStartDay: number
  /** Bumps on every header New click; consumed by a render-adjust. */
  createRequest: number
}

function TransactionsContent({ settings, calendarStartDay, createRequest }: TransactionsContentProps) {
  const { t } = useTranslation('transactions')
  const { t: tBookmarks } = useTranslation('bookmarks')
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const { data: accounts = [] } = useAccounts(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  // Filter state lives in the URL: shareable, bookmarkable, back-button friendly.
  const [searchParams, setSearchParams] = useSearchParams()
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
  // Filters by the transaction's stored own currency (account-less rows match
  // their own), never the informational original-amount facet.
  const enabledCodes = new Set(currencies.map((c) => c.code))
  // URL param is a CSV of codes; unknown/stale entries drop (type-filter idiom).
  const currencyFilter = (searchParams.get('currency') ?? '')
    .split(',')
    .filter((c) => enabledCodes.has(c))
  const amountMin = searchParams.get('amount_min') ?? ''
  const amountMax = searchParams.get('amount_max') ?? ''
  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')
  const rawType = searchParams.get('type')
  const page = intParam(searchParams, 'page') ?? 1
  // Garbage ?ordering= values read as unset (status-filter idiom): the Select
  // shows the default placeholder and the request sends nothing.
  const rawOrdering = searchParams.get('ordering')

  // Session defaults, restoredSearch pattern generalized to three facets:
  // the lazy initializer computes the latch ONCE from the resolved settings
  // and the mount-time URL (the latch builder is pure) - a mount WITH any
  // param of a facet never defaults that facet (a partial date deep link
  // kills only the range latch; the missing bound is never auto-filled).
  // A facet is null in the latch when its params are present, when the
  // stored value equals the page built-in, or when the range resolves to
  // 'all' - null means "write nothing", so a fresh all-null blob latches
  // nothing and this page behaves exactly as before the feature (unlike
  // Planned, whose all-null blob latches the current month).
  // Consumed - never re-applies - once a facet's param has been present
  // (see the adjusts below); a fresh mount re-initializes (accepted).
  const [defaultsLatch, setDefaultsLatch] = useState(() =>
    buildDefaultsLatch(settings, 'transactions', searchParams, calendarStartDay),
  )

  // Consume adjusts - fall-through render-adjusts on local state (the
  // sanctioned shape; never an effect, never router state). The
  // materialization write below lands every live facet at once, so several
  // consumes can fire on the same pass: FUNCTIONAL updaters are load-bearing
  // (an object-spread of the closure's stale latch would let the last write
  // resurrect facets an earlier one had killed). Each updater lands on a
  // value that disproves its own guard - the adjust terminates by
  // construction; hooks below stay unconditional; on the pass where it
  // fires the params already win the derivations, so no query key churns.
  if (defaultsLatch.range && (rawFrom !== null || rawTo !== null)) setDefaultsLatch((l) => ({ ...l, range: null }))
  if (defaultsLatch.type && rawType !== null) setDefaultsLatch((l) => ({ ...l, type: null }))
  if (defaultsLatch.ordering && rawOrdering !== null) setDefaultsLatch((l) => ({ ...l, ordering: null }))

  // Effective values - all reads below (queries, totals, badge, empty
  // state) use the EFFECTIVE value: explicit params win; absent falls back
  // to the still-live latch (the same value the materialization effect
  // below is about to write into the URL). ListFilterFields keeps reading
  // the RAW params (self-contained contract): before materialization the
  // panel is closed so no mismatch is visible, after it raw == effective.
  const dateFrom = rawFrom ?? defaultsLatch.range?.from ?? ''
  const dateTo = rawTo ?? defaultsLatch.range?.to ?? ''
  // The type facet is list-valued: param PRESENCE branches (the URL wins
  // outright; a garbage CSV degrades to [] in the page's own read, exactly
  // as today), absent falls back to the latched default list.
  const typeFilter =
    rawType !== null
      ? rawType.split(',').filter((v) => TYPE_OPTIONS.some((o) => o.value === v))
      : (defaultsLatch.type ?? [])
  const ordering = SORT_OPTIONS.some((o) => o.value === rawOrdering)
    ? (rawOrdering as TransactionOrdering)
    : defaultsLatch.ordering

  const [pageSize, setPageSize] = useState(getStoredPageSize)

  const updateParams = createUpdateParams(setSearchParams)

  // One-shot defaults materialization (useStalePageReset shape: the URL
  // write goes through the closure-wrapped updateParams, never
  // setSearchParams directly - the shipped precedent for a no-event URL
  // write from an effect; a render-adjust must not write router state).
  // Fires only while a latch facet is live: entering with a facet's params
  // absent writes the resolved default into the URL (replace, no history
  // entry). The write touches ONLY the defaultable param families
  // (from/to/type/ordering - the type list joins to CSV inside
  // createUpdateParams) plus its automatic ?page drop - never a FilterPanel
  // field. The consume adjusts above then kill the consumed facets, so
  // All time / Clear filters / deep links never re-default within a
  // session; a fresh mount re-initializes the latch (accepted).
  useEffect(() => {
    if (!defaultsLatch.range && !defaultsLatch.type && !defaultsLatch.ordering) return
    updateParams({
      ...(defaultsLatch.range ? { from: defaultsLatch.range.from, to: defaultsLatch.range.to } : {}),
      ...(defaultsLatch.type ? { type: defaultsLatch.type } : {}),
      ...(defaultsLatch.ordering ? { ordering: defaultsLatch.ordering } : {}),
    })
  }, [defaultsLatch, updateParams])

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

  // Each facet counts once, however many values it holds. Default-derived
  // params still count: a materialized default range or type list IS an
  // active filter (badge 1 with the panel closed is honest - the user can
  // see and clear what is filtering the list), so materialized params are
  // never excluded.
  const activeFilterCount = [
    accountFilter.length > 0,
    typeFilter.length > 0,
    budgetFilter.length > 0,
    categoryFilter.length > 0,
    currencyFilter.length > 0,
    Boolean(amountMin || amountMax),
    Boolean(dateFrom || dateTo),
  ].filter(Boolean).length

  // The panel opens only through the toggle - never automatically. Deep
  // links and bookmarks apply their filters silently; the toggle's badge
  // count is the visible signal that filters are active.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterPanelId = useId()

  // Clears URL params only - saved defaults (if any) are untouched: the
  // next fresh entry re-materializes them. Clearing is the user's explicit
  // all-time choice for THIS session (the latch is consumed).
  const clearFilters = () =>
    updateParams({ account: null, type: null, budget: null, category: null, currency: null, amount_min: null, amount_max: null, from: null, to: null })

  const isTouch = useIsTouch()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [copySource, setCopySource] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  // Bookmark capture of the current filter view (mount-per-use modal): the
  // target derives from the URL at open time, so a boolean is the whole state.
  const [pageBookmarkOpen, setPageBookmarkOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, pageSize, ordering, search, accountFilter.join(','), typeFilter.join(','), currencyFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo],
    queryFn: () =>
      transactionsApi.getAll({
        page,
        page_size: pageSize,
        search: search || undefined,
        account_id: accountFilter.length ? accountFilter : undefined,
        transaction_type: typeFilter.length ? typeFilter : undefined,
        currency_code: currencyFilter.length ? currencyFilter : undefined,
        budget_id: budgetFilter.length ? budgetFilter : undefined,
        category_id: categoryFilter.length ? categoryFilter : undefined,
        amount_gte: amountParam(amountMin),
        amount_lte: amountParam(amountMax),
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        ordering: ordering || undefined,
      }),
    // Previous page stays rendered while the next one loads — no skeleton
    // flash on page/filter changes (v5 placeholderData pattern).
    placeholderData: keepPreviousData,
  })

  // A stale ?page= beyond the (possibly shrunken) range resets to page 1 once
  // the response lands; the backend serves the clamped page meanwhile.
  useStalePageReset(page, data, updateParams)

  // Keyed INSIDE the ['transactions'] family so every existing invalidation of
  // that prefix (form modal, delete, extraction) refetches the strip too.
  // Same dependency values as the list query minus page/pageSize/ordering -
  // totals do not depend on pagination or sort.
  const { data: totalsData, isLoading: totalsIsLoading } = useQuery({
    queryKey: ['transactions', 'totals', search, accountFilter.join(','), typeFilter.join(','), currencyFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo],
    queryFn: () =>
      transactionsApi.getTotals({
        search: search || undefined,
        account_id: accountFilter.length ? accountFilter : undefined,
        transaction_type: typeFilter.length ? typeFilter : undefined,
        currency_code: currencyFilter.length ? currencyFilter : undefined,
        budget_id: budgetFilter.length ? budgetFilter : undefined,
        category_id: categoryFilter.length ? categoryFilter : undefined,
        amount_gte: amountParam(amountMin),
        amount_lte: amountParam(amountMax),
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        group_by: 'type',
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success(t('deleted'))
      setDeleting(null)
    },
    onError: (error) => { toast.error(getApiErrorMessage(error, t('deleteFailed'))); setDeleting(null) },
  })

  // Save the current view facets as this page's defaults. The URL is the
  // source of truth: the capture helper reads it into the full
  // transactions sub-object - a present page key is a full replace, so
  // every facet is always sent. Toasts are per-call callbacks: the shared
  // hook owns only the cache invalidation.
  const updateSettings = useUpdateWorkspaceSettings()
  const handleSaveDefaults = () => {
    updateSettings.mutate(
      { transactions: capturePageDefaults(searchParams, 'transactions', calendarStartDay) },
      {
        onSuccess: () => toast.success(t('saveDefaultsSuccess')),
        onError: (error) => toast.error(getApiErrorMessage(error, t('saveDefaultsFailed'))),
      },
    )
  }

  const openNew = () => { setEditing(null); setCopySource(null); setFormOpen(true) }
  const openEdit = (t: Transaction) => { setEditing(t); setCopySource(null); setFormOpen(true) }
  // Copy = new-transaction form prefilled from t, date reset to today. Also
  // reachable from inside the edit modal, which then morphs into copy mode.
  const openCopy = (t: Transaction) => { setEditing(null); setCopySource(t); setFormOpen(true) }

  const showAccountColumn = accounts.length > 1
  const items = data?.items ?? []

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const typeOptions = TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
  const sortOptions = SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))

  // Resolved in the body, not inside the JSX: the literal-string lint only
  // recognizes the unaliased t() callee, in attributes and children alike.
  const addBookmarkTitle = tBookmarks('addTransactionsAria')
  const addLabel = tBookmarks('addLabel')

  // Header New click, consumed: the counter lives in the gate wrapper (the
  // button is above the gate, the modal state is here). A click inside the
  // cold-cache gate window lands after materialization, against the
  // post-defaults view. The latch catches up to the counter on the very
  // next pass: the adjust terminates by construction and is
  // StrictMode-idempotent.
  const [consumedCreateRequest, setConsumedCreateRequest] = useState(createRequest)
  if (createRequest !== consumedCreateRequest) {
    setConsumedCreateRequest(createRequest)
    openNew()
  }

  return (
    <>
      {/* Below sm the fixed controls (filters toggle, bookmark button, sort)
          cannot share one line with the search box on 320px screens, so the
          row wraps: the search box claims the full first line (its
          max-sm:basis-full below), the controls flow onto the next. min-w-0
          lets the search box shrink where the row still holds one line. */}
      <div className="flex max-sm:flex-wrap gap-2 mb-3">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAria')}
          className="flex-1 min-w-0 max-w-sm max-sm:max-w-none max-sm:basis-full"
        />
        <FiltersToggle open={filtersOpen} count={activeFilterCount} onToggle={() => setFiltersOpen((v) => !v)} aria-controls={filterPanelId} />
        {/* Labeled like the header's export action; shrink-0 keeps the
            label on one line so the flex-1 SearchInput is the row member
            that yields on narrow screens. */}
        <button
          type="button"
          onClick={() => setPageBookmarkOpen(true)}
          title={addBookmarkTitle}
          className={`${secondaryButtonClass} shrink-0`}
        >
          <BookmarkPlus size={13} className="inline mr-1" /> {addLabel}
        </button>
        {/* Save the current view facets as this page's defaults. Sits with
            the bookmark action (the two save-view actions cluster) and
            before the ordering Select, which stays at row end. Visible on
            mobile too: a preference action with no FAB twin, like the
            header's export. In-flow wrap member of this max-sm:flex-wrap
            row; shrink-0 keeps the label on one line so the wrapped
            320px row still holds this button plus the Select. */}
        <button
          type="button"
          onClick={handleSaveDefaults}
          disabled={updateSettings.isPending}
          className={`${secondaryButtonClass} shrink-0`}
        >
          <Save size={13} className="inline mr-1" /> {updateSettings.isPending ? t('saveDefaultsPending') : t('saveDefaults')}
        </button>
        <Select
          value={ordering}
          onChange={(v) => updateParams({ ordering: v === DEFAULT_SORT ? null : v })}
          options={sortOptions}
          placeholder={t('sort.newest')}
          aria-label={t('sortAria')}
          className="w-48 max-sm:w-24 shrink-0"
        />
      </div>

      {filtersOpen && (
        <FilterPanel id={filterPanelId} onClear={activeFilterCount > 0 ? clearFilters : null}>
          {showAccountColumn && (
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
          <FilterField label={t('filters.type')}>
            <MultiSelect values={typeFilter} onChange={(v) => updateParams({ type: v })} options={typeOptions} placeholder={t('filters.allTypes')} aria-label={t('filters.byTypeAria')} className="w-full" />
          </FilterField>
          <ListFilterFields />
        </FilterPanel>
      )}

      {/* Hidden while the list itself is unknown/empty: no rows, no totals. */}
      {(data?.total ?? 0) > 0 && (
        <ListTotalsStrip
          caption={t('totals.caption', { count: data?.total ?? 0 })}
          items={totalsData?.totals ?? []}
          tone={(group) => (group === 'income' ? 'positive' : group === 'expense' ? 'negative' : 'neutral')}
          help={t('totals.help')}
          isLoading={totalsIsLoading}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">
          {search || activeFilterCount > 0 ? t('emptyFiltered') : t('empty')}
        </p>
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {items.map((tx) => {
            // Auto-created facet adjustments are managed by their source
            // transaction: no edit/copy/delete affordances, no tap-to-edit.
            const auto = tx.source_transaction_id != null
            return (
              <div
                key={tx.id}
                {...(!auto && isTouch && canWrite ? tappableProps(() => openEdit(tx)) : {})}
                className={`flex items-center justify-between px-4 py-2.5 text-sm group ${
                  !auto && isTouch && canWrite ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-text truncate">{tx.description}</span>
                    {tx.type === 'adjustment' && (
                      <span className="text-[9px] font-mono uppercase tracking-wider text-warning border border-warning/40 rounded-sm px-1">{t('adjBadge')}</span>
                    )}
                    {auto && (
                      <span title={t('autoBadgeTitle')} className="text-[9px] font-mono uppercase tracking-wider text-text-muted border border-border rounded-sm px-1">{t('autoBadge')}</span>
                    )}
                  </div>
                  {/* Single truncating string — a flex row here would wrap on long
                      category/account names and grow the row past spec height. */}
                  <div className="text-[10px] font-mono text-text-muted truncate">
                    {[tx.date, tx.category_name, showAccountColumn || !tx.account_name ? tx.account_name ?? t('noAccount') : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 pl-3">
                  <div className="text-right">
                    <span className={`font-mono whitespace-nowrap ${TYPE_STYLE[tx.type]}`}>
                      {tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : ''}
                      {formatAmount(tx.amount)} {multiCurrency ? tx.currency_code : ''}
                    </span>
                    {tx.original_amount && tx.original_currency_code && (
                      <div className="text-[10px] font-mono text-text-muted">
                        {formatAmount(tx.original_amount)} {tx.original_currency_code}
                      </div>
                    )}
                  </div>
                  {/* Hover reveals are pointer-fine only — on touch they'd be
                      invisible tap targets; the row tap opens the sheet instead.
                      Auto rows keep the block as an `invisible` spacer (no
                      hover, no focus, no clicks) so their amount stays aligned
                      with the editable rows' amounts. */}
                  {canWrite && !isTouch && (
                    <div className={`flex items-center gap-1 ${auto ? 'invisible' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                      <button onClick={() => openEdit(tx)} title={t('rowActions.edit')} className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                      <button onClick={() => openCopy(tx)} title={t('rowActions.copy')} className="text-text-muted hover:text-text p-1"><Copy size={13} /></button>
                      <button onClick={() => setDeleting(tx)} title={t('rowActions.delete')} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {data && data.total > 0 && (
        <div className="mt-4">
          <Pagination
            page={data.page}
            total_pages={data.total_pages}
            total={data.total}
            page_size={data.page_size}
            onPageChange={(p) => updateParams({ page: p })}
            onPageSizeChange={(s) => { setPageSize(s); setStoredPageSize(s); updateParams({ page: null }) }}
          />
        </div>
      )}

      <TransactionFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        transaction={editing}
        copyFrom={copySource}
        onCopy={openCopy}
        onDelete={(t) => { setFormOpen(false); setDeleting(t) }}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        title={t('deleteDialog.title')}
        message={t('deleteDialog.message', { description: deleting?.description })}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
      {pageBookmarkOpen && (
        <BookmarkFormModal
          pageContext={{ kind: 'transactions', params: paramsFromSearchParams(searchParams) }}
          onClose={() => setPageBookmarkOpen(false)}
        />
      )}
    </>
  )
}
