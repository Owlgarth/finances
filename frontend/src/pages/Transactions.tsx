import { useEffect, useId, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BookmarkPlus, Copy, Download, Plus, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { transactionsApi, type TransactionOrdering } from '../api/client'
import type { Transaction, UserWorkspaceSettings } from '../types'
import { useAccounts, useBudgets, useEnabledCurrencies, useMultiCurrency, useTransaction, useWorkspaceCategories } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from '../hooks/useWorkspaceSettings'
import { useActivityScope } from '../hooks/useActivityScope'
import { formatAmount } from '../utils/format'
import { isCalendarMonth, shiftMonth } from '../utils/dates'
import { runBlobExport } from '../utils/blobExport'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { amountParam, createUpdateParams, intListParam, intParam, useStalePageReset } from '../utils/params'
import { activeFilterCount, budgetChangePatch, buildTransactionsFilters, clearAllFilters, type FilterDef, type TransactionsFilterLookups, type TransactionsFilterValues } from '../utils/listFilters'
import { buildDefaultsLatch, capturePageDefaults } from '../utils/pageDefaults'
import { paramsFromSearchParams } from '../utils/bookmarks'
import { useBreakpoint, useIsTouch } from '../hooks/useBreakpoint'
import { useMainScrollRestoration } from '../hooks/useMainScrollRestoration'
import { useTransactionForm } from '../hooks/useTransactionForm'
import { tappableProps } from '../utils/tappable'
import BookmarkFormModal from '../components/modals/bookmarks/BookmarkFormModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Pagination from '../components/common/Pagination'
import MultiSelect from '../components/common/MultiSelect'
import SearchInput from '../components/common/SearchInput'
import Select from '../components/common/Select'
import ListFilterFields from '../components/common/ListFilterFields'
import ListTotalsStrip from '../components/common/ListTotalsStrip'
import AppliedFilters, { type AppliedFilterChip } from '../components/common/AppliedFilters'
import MonthStepper, { stepperRangeLabel } from '../components/common/MonthStepper'
import { FiltersToggle, FilterPanel, FilterField } from '../components/common/FilterBar'
import { FiltersTrigger } from '../components/filters/FiltersTrigger'
import FilterSheet from '../components/filters/FilterSheet'
import DateRangeEditor from '../components/filters/DateRangeEditor'
import MultiChoiceEditor from '../components/filters/MultiChoiceEditor'
import AmountRangeEditor from '../components/filters/AmountRangeEditor'
import ActivityTabs from '../components/layout/ActivityTabs'
import PageHeader from '../components/layout/PageHeader'
import DetailPanel from '../components/layout/DetailPanel'
import SplitView from '../components/layout/SplitView'
import TransactionAddRow from '../components/transactions/TransactionAddRow'
import TransactionFormFields from '../components/transactions/TransactionFormFields'
import TransactionRecord from '../components/transactions/TransactionRecord'
import TransactionsTable from '../components/transactions/TransactionsTable'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

// Same semantic color mapping as TYPE_STYLE in transactions/TransactionRecord.tsx
// and transactions/TransactionsTable.tsx (keep in sync; with a third consumer
// the copy belongs in a shared module at the next touch of all three).
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

/** Filter facets exactly as the list query's key uses them (what the server
 *  receives), for the panel keep/close reconcile below. */
interface RecordFilterFacets {
  search: string
  accountFilter: number[]
  typeFilter: string[]
  currencyFilter: string[]
  budgetFilter: number[]
  categoryFilter: number[]
  amountMin: string
  amountMax: string
  dateFrom: string
  dateTo: string
}

/** Exact cents of a backend amount string (BigInt, never parseFloat -
    backend amounts are exact 2-decimal strings; shorter fractions pad). */
function amountCents(raw: string): bigint {
  const negative = raw.startsWith('-')
  const abs = negative ? raw.slice(1) : raw
  const [intPart, fracPart = ''] = abs.split('.')
  return (negative ? -1n : 1n) * BigInt((intPart || '0') + fracPart.padEnd(2, '0').slice(0, 2))
}

/** Exact cents of an amount-filter bound string, rounded toward +infinity
    (a lower bound) or -infinity (an upper bound) past the 2nd decimal.
    The server compares the RAW decimal bound, so a 3+-decimal bound must
    never round in the keep-open direction: tx >= ceil(bound) proves
    tx >= bound, and tx <= floor(bound) proves tx <= bound. Unparseable
    strings read as unset, mirroring the server skipping the facet when
    the URL value is garbage. */
function amountBoundCents(raw: string, ceil: boolean): bigint | null {
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw)) return null
  const negative = raw.startsWith('-')
  const abs = raw.replace(/^[+-]/, '')
  const [intPart, fracPart = ''] = abs.split('.')
  let result = BigInt((intPart || '0') + fracPart.slice(0, 2).padEnd(2, '0'))
  // Digits past the 2nd decimal: "up" means +1 cent on a positive bound
  // but only dropping the tail on a negative one (toward zero is toward
  // +infinity); floor is the mirror image.
  const hasTail = fracPart.slice(2).replace(/0+$/, '').length > 0
  if (hasTail && ceil !== negative) result += 1n
  return negative ? -result : result
}

/**
 * Conservative client-side mirror of the list query's server filters:
 * returns true only when the record PROVABLY still matches every facet
 * the server applies. Budget and category filters OR-match transaction
 * ITEMS server-side, and item categories are not in the list payload, so
 * a record matching only through the item arm reads false here (close) -
 * sound for keep-open, the only decision this drives: a panel showing a
 * record the list no longer contains is the worse failure mode.
 */
function recordStillMatches(tx: Transaction, f: RecordFilterFacets): boolean {
  if (f.accountFilter.length && !f.accountFilter.includes(tx.account_id ?? -1)) return false
  if (f.typeFilter.length && !f.typeFilter.includes(tx.type)) return false
  if (f.currencyFilter.length && !f.currencyFilter.includes(tx.currency_code)) return false
  if (f.dateFrom && tx.date < f.dateFrom) return false
  if (f.dateTo && tx.date > f.dateTo) return false
  if (f.search && !tx.description.toLowerCase().includes(f.search.toLowerCase())) return false
  const minCents = amountBoundCents(f.amountMin, true)
  if (minCents !== null && amountCents(tx.amount) < minCents) return false
  const maxCents = amountBoundCents(f.amountMax, false)
  if (maxCents !== null && amountCents(tx.amount) > maxCents) return false
  if (f.categoryFilter.length && (tx.category_id == null || !f.categoryFilter.includes(tx.category_id))) return false
  if (f.budgetFilter.length && (tx.category_budget_id == null || !f.budgetFilter.includes(tx.category_budget_id))) return false
  return true
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
  const navigate = useNavigate()
  const { isDesktop, isTablet } = useBreakpoint()
  // 640-1023 scroll memory: <main> is the scroll container on that band
  // and a route swap clamps it (hooks/useMainScrollRestoration.ts).
  useMainScrollRestoration(isTablet)
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

  // The ?new= param drives the in-flow create panel at 1024+ (the content
  // reads it below); the wrapper needs it for the below-1024 redirect.
  // Garbage reads as unset (the page's garbage-filter idiom): ?new=foo
  // renders the plain list on every tier.
  const newParam = searchParams.get('new')

  // Below 1024 the create entry is the /new page (the FAB on phones, this
  // button on tablets); at 1024+ it opens the create panel. The branch
  // lives INSIDE the handler - the button stays mounted on every tier. The
  // account filter carries only when it resolves to exactly one id: /new
  // seeds a single account, never a CSV list.
  const handleCreate = () => {
    if (isDesktop) {
      // The ?new= param is the create panel's open state (shareable,
      // reload-safe). Drop any selected record - create wins the panel
      // slot - and any stale copy seed. REPLACE: an in-page selection
      // write is not a history step, so Back still leaves the page in
      // one press.
      const next = new URLSearchParams(searchParams)
      next.set('new', 'transaction')
      next.delete('copy')
      navigate(`/transactions?${next.toString()}`, { replace: true })
      return
    }
    const accountIds = intListParam(searchParams, 'account')
    navigate(accountIds.length === 1 ? `/new?account=${accountIds[0]}` : '/new')
  }

  const { activityTitle, breadcrumb } = useActivityScope()

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

  // Below 1024 the create surface is /new: a ?new= URL loaded or resized
  // into that band redirects there, forwarding ?copy= so a shared copy
  // link keeps its source. REPLACE: the ?new= URL is an implementation
  // detail of the desktop panel, not a history step. intParam drops
  // garbage copy values, so ?new=transaction&copy=abc degrades to /new.
  if (!isDesktop && newParam === 'transaction') {
    const copyId = intParam(searchParams, 'copy')
    return <Navigate to={copyId !== null ? `/new?copy=${copyId}` : '/new'} replace />
  }

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      {/* The title row and the Activity tab row stay mounted through the gate:
          route changes move focus to the page h1, and chrome that pops in
          after the gate is churn. The gated region is everything below the
          tab row. */}
      <PageHeader
        title={activityTitle}
        breadcrumb={breadcrumb}
        actions={
          <>
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
            {/* Hidden on phones (the FAB owns creation there); on tablets
                below 1024 it navigates to /new, at 1024+ it opens the
                create panel. */}
            {canWrite && (
              <button
                type="button"
                onClick={handleCreate}
                className={`${primaryButtonClass} max-sm:hidden`}
              >
                <Plus size={13} className="inline mr-1" /> {t('newTransaction')}
              </button>
            )}
          </>
        }
        showAccountActions
      />
      {/* Tab row: navigation chrome like the title row, mounted above the
          arrival gate. Later header actions append at this row's end - the
          control sizes to its segments and leaves the row's end free. */}
      <div className="flex items-center gap-2 mb-3">
        <ActivityTabs />
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
        <TransactionsContent settings={settings} calendarStartDay={calendarStartDay} />
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
}

function TransactionsContent({ settings, calendarStartDay }: TransactionsContentProps) {
  const { t } = useTranslation('transactions')
  const { t: tBookmarks } = useTranslation('bookmarks')
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const { data: accounts = [] } = useAccounts(false)
  const { data: currencies = [] } = useEnabledCurrencies()
  // Facet lists for the filter registry (availability + summaries). The
  // keys match ListFilterFields' own hooks, so the entries are cache-shared:
  // no extra request when the panel opens, one fetch per stale window with
  // it closed.
  const { data: budgets = [] } = useBudgets(false)
  const { data: categories = [] } = useWorkspaceCategories(false)

  // Filter state lives in the URL: shareable, bookmarkable, back-button friendly.
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  // The list page hosts the record panel at 1024+, so it reads :id itself
  // (both /transactions and /transactions/:id render this component there).
  const { isMobile, isDesktop } = useBreakpoint()
  const params = useParams()
  const recordId = params.id && /^\d+$/.test(params.id) ? Number(params.id) : null
  // The create panel opens on the exact ?new=transaction value at 1024+
  // (garbage reads as unset, the page's garbage-filter idiom). Precedence:
  // the create panel wins the panel slot over a selected record - every
  // create-open write drops the selection path, so the two states are
  // never both visible.
  const createOpen = isDesktop && searchParams.get('new') === 'transaction'
  // Shares the ['transactions','detail',id] cache entry with the record page
  // and the /new copy query - one entry per id, refreshed by every
  // family-wide invalidation.
  const { data: record, isLoading: recordLoading, isError: recordError } = useTransaction(recordId)
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
  const filterLookups = {
    accounts,
    budgets,
    categories,
    multiCurrency,
    selectedCount: (count: number) => tCommon('multiSelect.selectedCount', { count }),
    typeLabels: Object.fromEntries(TYPE_OPTIONS.map((o) => [o.value, t(o.labelKey)])),
  }
  const filterDefs = buildTransactionsFilters(filterLookups)
  const filterValues = {
    account: accountFilter,
    type: typeFilter,
    currency: currencyFilter,
    budget: budgetFilter,
    category: categoryFilter,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
  }
  const activeCount = activeFilterCount(filterDefs, filterValues, filterLookups)

  // The panel opens only through the toggle - never automatically. Deep
  // links and bookmarks apply their filters silently; the toggle's badge
  // count is the visible signal that filters are active.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterPanelId = useId()

  // Phone filter sheet - the panel's phone replacement (the panel remains
  // the 640+ surface until the toolbar redesign retires it).
  const [sheetOpen, setSheetOpen] = useState(false)
  // Tier crossing: the sheet is phone-only and the panel 640+-only, so a
  // crossing closes the departing surface - an open flag surviving the
  // crossing would resurrect the surface on rotate-back. Every filter
  // change is already on the URL, so no other state needs preserving.
  // Loop-safe by construction (each write lands on a value that disproves
  // its own guard); StrictMode-idempotent.
  const [prevMobile, setPrevMobile] = useState(isMobile)
  if (prevMobile !== isMobile) {
    setPrevMobile(isMobile)
    if (!isMobile) setSheetOpen(false)
    else setFiltersOpen(false)
  }

  // Clears URL params only - saved defaults (if any) are untouched: the
  // next fresh entry re-materializes them. Clearing is the user's explicit
  // all-time choice for THIS session (the latch is consumed).
  const clearFilters = () => updateParams(clearAllFilters(filterDefs))

  // Stepper derivations on the EFFECTIVE range (explicit params win, latch
  // fallback before materialization - the same values the list query uses).
  const exactMonth = isCalendarMonth(dateFrom, dateTo)
  const stepperLabel = stepperRangeLabel(dateFrom, dateTo, t('listFilters.presetAllTime'))
  // Adjacent-month hop: the target computes from exactMonth (the range on
  // screen), never from "today"; shiftMonth's monthRange core rolls
  // out-of-range months by construction. createUpdateParams drops ?page on
  // any patch that does not set it, so no explicit page clearing.
  const handleMonthShift = (delta: number) => {
    if (!exactMonth) return
    updateParams(shiftMonth(exactMonth, delta))
  }

  // Applied-filter chips: every active registry filter except date (the
  // stepper owns the date). Badge and chips read the same isActive, so a
  // materialized default facet shows as a chip exactly when it counts.
  // Amount summaries are numeric in every shape and render font-mono;
  // name/"N selected" summaries stay in the UI font.
  // Registry labelKeys are data strings - plain keys in this namespace,
  // cross-namespace ones 'ns:'-qualified. Typed i18next only accepts a
  // dynamic key alongside an explicit fallback, so the fallback mirrors the
  // key: every landed labelKey resolves and a missing one would render its
  // own key (immediately visible, never a silent blank).
  const filterLabel = (key: string) => t(key, { defaultValue: key })
  const appliedChips: AppliedFilterChip[] = filterDefs
    .filter((d) => d.id !== 'date' && d.isActive(filterValues, filterLookups))
    .map((d) => ({
      id: d.id,
      label: filterLabel(d.labelKey),
      summary: d.editor === 'amount'
        ? <span className="font-mono">{d.summarize(filterValues, filterLookups)}</span>
        : d.summarize(filterValues, filterLookups),
      onRemove: () => updateParams(d.clear()),
    }))

  const isTouch = useIsTouch()

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

  // Row tap opens the record page: a PUSH (browser Back replays this
  // list's URL) with the click-time search string in router state, so
  // the record page's header back target preserves the filters and page.
  // Same click-time-URL discipline as handleExportView in the gate
  // wrapper above.
  const openRecord = (tx: Transaction) => {
    navigate(`/transactions/${tx.id}`, { state: { search: searchParams.toString() } })
  }
  // Table row open (640+): the tier fork lives INSIDE the handler so the
  // table stays mounted on every tier. At 1024+ a panel is "already open"
  // when this render sits on /transactions/:id - read at click time so the
  // FIRST open pushes (Back returns to the bare list) and every later
  // selection change replaces (Back never walks a click trail). The list
  // filters travel in the record URL so the list keeps filtering beside
  // the panel; below 1024 the push carries them in router state instead.
  const handleOpenRecord = (tx: Transaction) => {
    if (isDesktop) {
      // Strip the create panel's params: a row click while the panel is
      // open must open the record, not carry ?new= into the record URL
      // where the panel would keep winning the slot.
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      next.delete('copy')
      navigate(
        { pathname: `/transactions/${tx.id}`, search: next.toString() },
        { replace: recordId != null },
      )
    } else {
      navigate(`/transactions/${tx.id}`, { state: { search: searchParams.toString() } })
    }
  }
  // Panel close (X, Escape, or the filter reconcile below): replace keeps
  // the closed record's URL out of Back's path.
  const handleClosePanel = () =>
    navigate({ pathname: '/transactions', search: searchParams.toString() }, { replace: true })
  // Create panel close - the record close write plus dropping the create
  // params: a stale ?copy= must not re-seed the next create. The selection
  // path drops with them (a create-open already superseded any record).
  const closeCreatePanel = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.delete('copy')
    navigate(`/transactions?${next.toString()}`, { replace: true })
  }
  // Copy = create form prefilled from the source, date reset to today. At
  // 1024+ the fork opens the create panel in copy mode (?new= with ?copy=
  // riding along); below 1024 it navigates to /new?copy=. The fork lives
  // INSIDE the handler - the affordance stays mounted on every tier it
  // appears at.
  const openCopy = (tx: Transaction) => {
    if (isDesktop) {
      const next = new URLSearchParams(searchParams)
      next.set('new', 'transaction')
      next.set('copy', String(tx.id))
      navigate(`/transactions?${next.toString()}`, { replace: true })
      return
    }
    navigate(`/new?copy=${tx.id}`)
  }

  // Filter facets only - ordering/page/pageSize do not change membership.
  const filterKey = [search, accountFilter.join(','), typeFilter.join(','), currencyFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo].join('|')
  // Keep-or-close reconcile for the open panel: when a filter change (or a
  // record error - deleted, foreign) proves the record no longer matches
  // the query, close the panel; a still-matching record stays open even
  // when it falls off the visible page. Response arrival is not an event,
  // so a guarded effect is the only possible seam, and it navigates (a
  // router write, never component state).
  useEffect(() => {
    if (!(isDesktop && recordId != null)) return
    // A create URL wins the panel slot over the record: the reconcile
    // must not navigate away from the open create panel.
    if (createOpen) return
    if (recordLoading) return
    if (recordError || !record || !recordStillMatches(record, { search, accountFilter, typeFilter, currencyFilter, budgetFilter, categoryFilter, amountMin, amountMax, dateFrom, dateTo })) {
      navigate({ pathname: '/transactions', search: searchParams.toString() }, { replace: true })
    }
    // The effect reads the CURRENT filter values by design; filterKey is
    // the change signal, so the deps list is deliberately partial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, recordId, isDesktop, createOpen, record, recordLoading, recordError])

  const showAccountColumn = accounts.length > 1
  const items = data?.items ?? []

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const typeOptions = TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
  const sortOptions = SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))
  // Editor option lists for the phone filter sheet, mirroring the panel
  // fields: the budget filter narrows the category options and prunes
  // selections that no longer belong (the registry's budget change rule).
  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const budgetNames = new Map(budgets.map((b) => [b.id, b.name]))
  const budgetSet = new Set(budgetFilter)
  const showBudgetSuffix = budgets.length > 1 && budgetFilter.length !== 1
  const categoryOptions = categories
    .filter((c) => budgetSet.size === 0 || budgetSet.has(c.budget_id))
    .map((c) => ({
      value: c.id,
      label: showBudgetSuffix ? `${c.name} · ${budgetNames.get(c.budget_id) ?? ''}` : c.name,
    }))

  // Editor bodies for the sheet's editor level: each def wired with the
  // same options and URL writes as the panel fields above.
  const renderSheetEditor = (def: FilterDef<TransactionsFilterValues, TransactionsFilterLookups>) => {
    switch (def.id) {
      case 'date':
        return (
          <DateRangeEditor
            value={{ from: dateFrom, to: dateTo }}
            onChange={(n) => updateParams({ from: n.from, to: n.to })}
          />
        )
      case 'account':
        return (
          <MultiChoiceEditor
            value={accountFilter}
            onChange={(v) => updateParams({ account: v })}
            options={accountOptions}
            aria-label={t('filters.byAccountAria')}
          />
        )
      case 'type':
        return (
          <MultiChoiceEditor
            value={typeFilter}
            onChange={(v) => updateParams({ type: v })}
            options={typeOptions}
            aria-label={t('filters.byTypeAria')}
          />
        )
      case 'currency':
        return (
          <MultiChoiceEditor
            value={currencyFilter}
            onChange={(v) => updateParams({ currency: v })}
            options={currencyOptions}
            aria-label={t('filters.byCurrencyAria')}
          />
        )
      case 'budget':
        return (
          <MultiChoiceEditor
            value={budgetFilter}
            onChange={(v) => updateParams(budgetChangePatch(v, filterValues, filterLookups))}
            options={budgetOptions}
            aria-label={t('listFilters.byBudgetAria')}
          />
        )
      case 'category':
        return (
          <MultiChoiceEditor
            value={categoryFilter}
            onChange={(v) => updateParams({ category: v })}
            options={categoryOptions}
            searchable
            aria-label={t('listFilters.byCategoryAria')}
          />
        )
      case 'amount':
        return (
          <AmountRangeEditor
            value={{ min: amountMin, max: amountMax }}
            onChange={(n) => updateParams({ amount_min: n.min, amount_max: n.max })}
          />
        )
    }
  }

  // Resolved in the body, not inside the JSX: the literal-string lint only
  // recognizes the unaliased t() callee, in attributes and children alike.
  const addBookmarkTitle = tBookmarks('addTransactionsAria')
  const addLabel = tBookmarks('addLabel')

  // Pagination rides whichever list arm renders (below the phone rows, or
  // inside the split view's list slot - at 1024+ the strip must sit under
  // the table, not span the panel too).
  const pagination = data && data.total > 0 ? (
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
  ) : null

  return (
    <>
      <MonthStepper
        label={stepperLabel}
        onShift={exactMonth ? handleMonthShift : undefined}
      />
      <AppliedFilters chips={appliedChips} onClearAll={clearFilters} />
      {/* Below sm the row holds the search box (full wrap line) and the
          phone Filters trigger; the bookmark/save/sort actions move into
          the phone filter sheet, and the desktop toggle/panel pair stays
          640+. The wrap recipe is unchanged: the search box claims the
          full first line (max-sm:basis-full), the trigger flows onto the
          next. min-w-0 lets the search box shrink where the row still
          holds one line. */}
      <div className="flex max-sm:flex-wrap gap-2 mb-3">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAria')}
          className="flex-1 min-w-0 max-w-sm max-sm:max-w-none max-sm:basis-full"
        />
        {/* Wrapper div hides the desktop toggle below 640: the toggle takes
            no className prop, and a call-site wrapper is the least invasive
            gate (the toggle keeps its accordion wiring at 640+). */}
        <div className="max-sm:hidden shrink-0">
          <FiltersToggle open={filtersOpen} count={activeCount} onToggle={() => setFiltersOpen((v) => !v)} aria-controls={filterPanelId} />
        </div>
        {/* Labeled like the header's export action; shrink-0 keeps the
            label on one line so the flex-1 SearchInput is the row member
            that yields on narrow screens. On phones the sheet's bookmark
            row owns this action. */}
        <button
          type="button"
          onClick={() => setPageBookmarkOpen(true)}
          title={addBookmarkTitle}
          className={`${secondaryButtonClass} shrink-0 max-sm:hidden`}
        >
          <BookmarkPlus size={13} className="inline mr-1" /> {addLabel}
        </button>
        {/* Save the current view facets as this page's defaults. Sits with
            the bookmark action (the two save-view actions cluster) and
            before the ordering Select, which stays at row end. On phones
            the sheet's save row owns this action; shrink-0 keeps the label
            on one line. */}
        <button
          type="button"
          onClick={handleSaveDefaults}
          disabled={updateSettings.isPending}
          className={`${secondaryButtonClass} shrink-0 max-sm:hidden`}
        >
          <Save size={13} className="inline mr-1" /> {updateSettings.isPending ? t('saveDefaultsPending') : t('saveDefaults')}
        </button>
        <Select
          value={ordering}
          onChange={(v) => updateParams({ ordering: v === DEFAULT_SORT ? null : v })}
          options={sortOptions}
          placeholder={t('sort.newest')}
          aria-label={t('sortAria')}
          className="w-48 shrink-0 max-sm:hidden"
        />
        <FiltersTrigger open={sheetOpen} count={activeCount} onOpen={() => setSheetOpen(true)} />
      </div>

      {/* Phone gating: the panel (and its native date inputs) never mounts
          below 640 - the FilterSheet below is the phone surface, and a
          stale-open flag after a down-crossing must not resurrect it. */}
      {filtersOpen && !isMobile && (
        <FilterPanel id={filterPanelId} onClear={activeCount > 0 ? clearFilters : null}>
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
          {search || activeCount > 0 ? t('emptyFiltered') : t('empty')}
        </p>
      ) : isMobile ? (
        <>
          {/* Phone list (unchanged): two-line div rows; the touch row tap
              pushes the full record page (openRecord carries the
              click-time search in router state). */}
          <div className="border border-border rounded-sm bg-surface divide-y divide-border">
            {items.map((tx) => {
              // Auto-created facet adjustments are managed by their source
              // transaction: no copy/delete affordances, no tap-to-open.
              const auto = tx.source_transaction_id != null
              return (
                <div
                  key={tx.id}
                  {...(!auto && isTouch && canWrite ? tappableProps(() => openRecord(tx)) : {})}
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
                    {/* Hover reveals are pointer-fine only - on touch they'd be
                        invisible tap targets; the row tap opens the record page
                        instead. Auto rows keep the block as an `invisible` spacer (no
                        hover, no focus, no clicks) so their amount stays aligned
                        with the editable rows' amounts. */}
                    {canWrite && !isTouch && (
                      <div className={`flex items-center gap-1 ${auto ? 'invisible' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                        <button onClick={() => openCopy(tx)} title={t('rowActions.copy')} className="text-text-muted hover:text-text p-1"><Copy size={13} /></button>
                        <button onClick={() => setDeleting(tx)} title={t('rowActions.delete')} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {pagination}
        </>
      ) : (
        <SplitView
          list={
            <>
              {/* Inline create row: desktop tier, writers only (the
                  640-1023 band keeps the create page route; viewers
                  never create). Seeded from the account filter only when
                  it resolves to exactly one account. The hotkey stays
                  disabled while a record panel is open and while the
                  create panel is open (?new=) - both are in-flow panels,
                  not overlays, so the row's own overlay check cannot keep
                  the hotkey from stealing their focus. */}
              <TransactionsTable
                items={items}
                selectedId={isDesktop ? recordId : null}
                showAccountColumn={showAccountColumn}
                multiCurrency={multiCurrency}
                onOpen={handleOpenRecord}
                leadRow={canWrite && isDesktop ? (
                  <TransactionAddRow
                    initialAccountId={accountFilter.length === 1 ? accountFilter[0] : null}
                    hotkeyEnabled={recordId == null && !searchParams.has('new')}
                  />
                ) : null}
              />
              {pagination}
            </>
          }
          panel={createOpen ? (
            <CreateTransactionPanel onClose={closeCreatePanel} />
          ) : isDesktop && recordId != null ? (
            // The record renders its own footer internally (Duplicate and
            // Delete), so the panel shell passes no footer. The title falls
            // back to the generic record label only for the loading window;
            // once loaded the description is the title.
            <DetailPanel title={record?.description ?? t('record.title')} onClose={handleClosePanel}>
              {recordLoading ? (
                // Hold, never flash: fields would flash unstyled while the
                // row loads. A record that errors out (deleted, foreign)
                // closes via the keep/close reconcile above.
                <div className="space-y-3 pt-2" aria-hidden="true">
                  <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
                  <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
                </div>
              ) : record ? (
                <TransactionRecord
                  transaction={record}
                  canWrite={canWrite}
                  onDuplicate={openCopy}
                  onDelete={(tx) => setDeleting(tx)}
                />
              ) : null}
            </DetailPanel>
          ) : null}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleting}
        title={t('deleteDialog.title')}
        message={t('deleteDialog.message', { description: deleting?.description })}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
      {/* Mounted before the bookmark modal so the chained modal (opened by
          the sheet's bookmark row, which closes the sheet first) stacks
          above the sheet during its exit animation. */}
      {isMobile && (
        <FilterSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          filters={filterDefs}
          values={filterValues}
          lookups={filterLookups}
          filterLabel={filterLabel}
          updateParams={updateParams}
          renderEditor={renderSheetEditor}
          sort={{
            value: ordering || DEFAULT_SORT,
            options: sortOptions,
            onChange: (v) => updateParams({ ordering: v === DEFAULT_SORT ? null : v }),
          }}
          onSaveDefaults={handleSaveDefaults}
          saveDefaultsPending={updateSettings.isPending}
          saveDefaultsLabel={t('saveDefaults')}
          saveDefaultsPendingLabel={t('saveDefaultsPending')}
          bookmark={{
            label: addLabel,
            ariaLabel: addBookmarkTitle,
            // Close the sheet FIRST, then open the modal - one handler, one
            // commit; the params are already on the URL, so nothing is lost.
            onOpen: () => {
              setSheetOpen(false)
              setPageBookmarkOpen(true)
            },
          }}
          total={data?.total ?? 0}
          footerNoun={t('sheetNoun', { count: data?.total ?? 0 })}
        />
      )}
      {pageBookmarkOpen && (
        <BookmarkFormModal
          pageContext={{ kind: 'transactions', params: paramsFromSearchParams(searchParams) }}
          onClose={() => setPageBookmarkOpen(false)}
        />
      )}
    </>
  )
}

/** In-flow create/copy host for the SplitView panel slot (the ?new= URL is
 *  the open state; the page passes the close write). Single form flavor:
 *  the fields component renders its full layout (no shared rows), no
 *  transfer flavor, no receipt-first prefill - that entry stays /new's
 *  Scan action at every width; the fields component's own More-details
 *  receipt affordance needs no host wiring. */
function CreateTransactionPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('transactions')
  const [searchParams] = useSearchParams()

  // LIVE read, not a lazy initializer: a row-copy click can re-target the
  // panel while it is open (param-only navigation never re-runs lazy
  // initializers), and the form hook's session machinery treats the
  // copyFrom change as a new seeding session.
  const copyId = intParam(searchParams, 'copy')

  // Copy-mode source fetch, the /new page's contract: keyed INSIDE the
  // ['transactions'] family so the form's own invalidations refetch it. A
  // terminal error counts as known - a failed copy fetch degrades to plain
  // create mode (the URL keeps ?copy=; the user can retry by reloading).
  const copyQuery = useQuery({
    queryKey: ['transactions', 'detail', copyId],
    queryFn: () => transactionsApi.get(copyId!),
    enabled: copyId !== null,
  })
  const copyKnown = copyId === null || copyQuery.isSuccess || copyQuery.isError

  // open gates on the copy seed resolving, so the hook seeds exactly once
  // with the final copyFrom (no create-then-copy double seed). Default
  // validationToasts: the fields component owns inline error timing via
  // the hook's submit counter, and the toasts still fire from submit().
  const form = useTransactionForm({ open: copyKnown, copyFrom: copyQuery.data ?? null })

  const [confirmOpen, setConfirmOpen] = useState(false)
  // An accidental Escape/X over typed text must not lose data the /new
  // flow protects - the same unsaved-changes guard as the create page.
  const dirtyClose = () => (form.isDirty ? setConfirmOpen(true) : onClose())

  const handleAdd = async () => {
    const result = await form.submit()
    // Close only on success: validation failures keep the panel open with
    // its inline errors and toasts.
    if (result.ok) onClose()
  }

  // Copy-seed arrival hold, the /new page's skeleton idiom.
  const panel = !copyKnown ? (
    <DetailPanel title={t('form.newTitle')} onClose={dirtyClose}>
      <div className="space-y-3 pt-2" aria-hidden="true">
        <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
        <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
      </div>
    </DetailPanel>
  ) : (
    <DetailPanel
      title={t('form.newTitle')}
      onClose={dirtyClose}
      footer={
        // The footer prop pins the buttons below the scrolling body -
        // buttons inside the body would scroll out of view. The primary
        // action calls handleAdd directly (the panel owns the section
        // markup, so there is no <form> element) and is type="button" so
        // it can never submit a parent form. form.add and form.newTitle
        // for create AND copy - the panel is never edit mode.
        <div className="flex justify-end gap-2">
          <button type="button" onClick={dirtyClose} className={secondaryButtonClass}>
            {t('form.cancel')}
          </button>
          <button type="button" onClick={handleAdd} disabled={form.isSaving} className={primaryButtonClass}>
            {form.isSaving ? t('form.saving') : t('form.add')}
          </button>
        </div>
      }
    >
      {/* Keyed on the hook's session key per the fields component's host
          contract: a session change (copy re-target, open flip) remounts
          it, resetting its local state and re-firing the amount
          autoFocus. */}
      <TransactionFormFields key={form.sessionKey} form={form} />
    </DetailPanel>
  )

  return (
    <>
      {panel}
      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('unsavedChanges.title')}
        message={t('unsavedChanges.message')}
        confirmLabel={t('unsavedChanges.discard')}
        destructive
        onConfirm={() => {
          setConfirmOpen(false)
          onClose()
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
