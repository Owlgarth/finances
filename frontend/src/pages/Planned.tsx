import { useEffect, useRef, useState } from 'react'
import { useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Ban, CalendarClock, Copy, Download, Loader2, Pause, Play, Plus, Pencil, Repeat, SlidersHorizontal, Trash2, CheckCircle } from 'lucide-react'
import { plannedTransactionsApi, recurringTransactionsApi, type PlannedTransactionOrdering } from '../api/client'
import type { PlannedTransaction, RecurringTransaction, UserWorkspaceSettings } from '../types'
import { useAccounts, useBudgets, useEnabledCurrencies, useMultiCurrency, usePlannedTransaction, useWorkspaceCategories } from '../hooks/useDomain'
import { usePayPlannedForm, usePlannedPayment } from '../hooks/usePlannedPayment'
import { usePermissions } from '../hooks/usePermissions'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from '../hooks/useWorkspaceSettings'
import { useActivityScope } from '../hooks/useActivityScope'
import { formatAmount, formatMonthYear } from '../utils/format'
import { runBlobExport } from '../utils/blobExport'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { amountParam, createUpdateParams, intListParam, intParam, useStalePageReset } from '../utils/params'
import { paramsFromSearchParams } from '../utils/bookmarks'
import { isCalendarMonth, shiftMonth } from '../utils/dates'
import { buildDefaultsLatch, capturePageDefaults } from '../utils/pageDefaults'
import { activeFilterCount, budgetChangePatch, buildPlannedFilters, clearAllFilters, type FilterDef, type FilterLookups, type PlannedFilterValues } from '../utils/listFilters'
import { useBreakpoint, useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import BookmarkFormModal from '../components/modals/bookmarks/BookmarkFormModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'
import SegmentedControl from '../components/common/SegmentedControl'
import SearchInput from '../components/common/SearchInput'
import Select from '../components/common/Select'
import SwipeRow from '../components/common/SwipeRow'
import ListTotalsStrip from '../components/common/ListTotalsStrip'
import PlannedStatusChip from '../components/transactions/PlannedStatusChip'
import PlannedRecord from '../components/transactions/PlannedRecord'
import PlannedCreatePanel from '../components/transactions/PlannedCreatePanel'
import PayPlannedForm from '../components/transactions/PayPlannedForm'
import { type AppliedFilterChip } from '../components/common/AppliedFilters'
import MonthStepper, { stepperRangeLabel } from '../components/common/MonthStepper'
import { FiltersTrigger } from '../components/filters/FiltersTrigger'
import FilterSheet from '../components/filters/FilterSheet'
import FilterChipsBar from '../components/filters/FilterChipsBar'
import DateRangeEditor from '../components/filters/DateRangeEditor'
import MultiChoiceEditor from '../components/filters/MultiChoiceEditor'
import AmountRangeEditor from '../components/filters/AmountRangeEditor'
import ActivityTabs from '../components/layout/ActivityTabs'
import PageHeader from '../components/layout/PageHeader'
import DetailPanel from '../components/layout/DetailPanel'
import SplitView from '../components/layout/SplitView'
import { controlHeightClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

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

// Same cents helpers as the transactions list's record mirror (a third copy
// belongs in a shared module at the next touch of all three).
/** Exact cents of a backend amount string (BigInt, never parseFloat -
    backend amounts are exact 2-decimal strings; shorter fractions pad). */
function amountCents(raw: string): bigint {
  const negative = raw.startsWith('-')
  const abs = negative ? raw.slice(1) : raw
  const [intPart, fracPart = ''] = abs.split('.')
  return (negative ? -1n : 1n) * BigInt((intPart || '0') + fracPart.padEnd(2, '0').slice(0, 2))
}

/** Exact cents of an amount-filter bound, rounded toward +infinity (a lower
    bound) or -infinity (an upper bound) past the 2nd decimal: the server
    compares the bound it receives, so a 3+-decimal bound must never round
    in the keep-open direction. Unparseable strings read as null. */
function amountBoundCents(raw: string, ceil: boolean): bigint | null {
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(raw)) return null
  const negative = raw.startsWith('-')
  const abs = raw.replace(/^[+-]/, '')
  const [intPart, fracPart = ''] = abs.split('.')
  let result = BigInt((intPart || '0') + fracPart.slice(0, 2).padEnd(2, '0'))
  // Digits past the 2nd decimal: "up" means +1 cent on a positive bound but
  // only dropping the tail on a negative one (toward zero is toward
  // +infinity); floor is the mirror image.
  const hasTail = fracPart.slice(2).replace(/0+$/, '').length > 0
  if (hasTail && ceil !== negative) result += 1n
  return negative ? -result : result
}

/** True when the item's amount satisfies one amount bound the way the list
 *  request sends it. The list sends Number(raw): a bound the server never
 *  receives (empty, or text Number() rejects) filters nothing; a bound this
 *  module cannot read in exact cents proves nothing, so it reads as a
 *  mismatch, like every other facet the payload cannot evaluate. */
function amountWithin(amount: string, raw: string, ceil: boolean): boolean {
  if (raw === '') return true
  const sent = amountParam(raw)
  if (sent === undefined) return true
  const bound = amountBoundCents(String(sent), ceil)
  return bound !== null && (ceil ? amountCents(amount) >= bound : amountCents(amount) <= bound)
}

/** The facets of the list query that decide membership (ordering, page and
 *  page size never remove an item). */
interface PlannedRecordFacets {
  status: StatusFilter
  search: string
  account: number[]
  currency: string[]
  budget: number[]
  category: number[]
  amountMin: string
  amountMax: string
  dateFrom: string
  dateTo: string
}

/**
 * Conservative client-side mirror of the list query's server filters:
 * true only when the item PROVABLY still matches every facet the server
 * applies, so it is sound for keep-open - the only decision it drives. A
 * panel showing an item the list no longer contains is the worse failure.
 */
function plannedStillMatches(p: PlannedTransaction, f: PlannedRecordFacets): boolean {
  if (f.status !== 'all' && p.status !== f.status) return false
  if (f.account.length && (p.account_id == null || !f.account.includes(p.account_id))) return false
  if (f.currency.length && !f.currency.includes(p.currency_code)) return false
  if (f.dateFrom && p.planned_date < f.dateFrom) return false
  if (f.dateTo && p.planned_date > f.dateTo) return false
  if (f.search && !p.name.toLowerCase().includes(f.search.toLowerCase())) return false
  // The budget filter runs through the item's category server-side, so an
  // uncategorized item never matches it.
  if (f.budget.length && (p.category == null || !f.budget.includes(p.category.budget_id))) return false
  if (f.category.length && (p.category_id == null || !f.category.includes(p.category_id))) return false
  if (!amountWithin(p.amount, f.amountMin, true)) return false
  if (!amountWithin(p.amount, f.amountMax, false)) return false
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
export default function Planned() {
  const { t } = useTranslation('planned')
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { canWrite } = usePermissions()
  const { isDesktop } = useBreakpoint()
  // True while one of the item panels is open: create, record or pay. The
  // record pattern's dynamic segment also matches the create path, so the
  // two patterns cover all three.
  const recordMatch = useMatch('/planned/:id')
  const payMatch = useMatch('/planned/:id/pay')
  const itemPanelOpen = recordMatch !== null || payMatch !== null
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

  const { activityTitle, breadcrumb } = useActivityScope()
  const updateParams = createUpdateParams(setSearchParams)

  // Phone-only home of the view switch: the segmented row hides below sm,
  // so this button is the only way into the recurring view there. Same
  // ['recurring'] key as the content's view-gated query - cache-shared and
  // deduped - but unconditional, so the active-rule count is derivable
  // above the arrival gate where the button lives.
  const { data: recurringRules = [] } = useQuery({
    queryKey: ['recurring'],
    queryFn: () => recurringTransactionsApi.getAll(true),
  })
  const activeRuleCount = recurringRules.filter((r) => r.is_active).length
  const rulesButtonLabel = t('recurring.rulesButton', { count: activeRuleCount })

  // Fall-through reset of the skeleton flag (lands on false, which disproves
  // its own guard - terminates by construction; StrictMode-idempotent).
  if (!defaultsLoading && skeletonShown) setSkeletonShown(false)

  // Header view label follows the URL: the stored default view is not
  // resolved during the gate window, so the label may flip once after
  // materialization - accepted, the header stays mounted either way.
  const rawView = searchParams.get('view')
  const view: 'planned' | 'recurring' = rawView === 'recurring' ? 'recurring' : 'planned'

  // Export reads the URL at click time instead of threading the content's
  // effective derivations across the boundary: the URL is the source of
  // truth once the defaults have materialized into it. Tradeoff: a click
  // inside the brief cold-cache gate window exports all-time / all
  // statuses - a benign degradation; every click after materialization
  // matches the on-screen view.
  const handleExportView = async () => {
    setIsExporting(true)
    // runBlobExport never throws; it owns every export toast.
    const rawStatus = searchParams.get('status')
    const status: StatusFilter = STATUS_OPTIONS.some((o) => o.value === rawStatus) ? (rawStatus as StatusFilter) : 'all'
    const from = searchParams.get('from') ?? ''
    const to = searchParams.get('to') ?? ''
    await runBlobExport(
      () => plannedTransactionsApi.exportView({
        status: status === 'all' ? undefined : status,
        start_date: from || undefined,
        end_date: to || undefined,
      }),
      {
        filename: `planned_${from || 'all'}_${to || 'all'}.json`,
        loadingMessage: t('preparingExport'),
        successMessage: t('exportComplete'),
        errorMessage: t('exportFailed'),
      },
    )
    setIsExporting(false)
  }

  // The tier fork lives INSIDE the handler, so the button stays mounted on
  // every tier. Below 1024 the create form is a full page, opened with a
  // push so Back returns to this list. At 1024+ the form opens in the side
  // panel and this list keeps filtering beside it, so the current search
  // travels in the URL: the first open is a push, and a click while a panel
  // is already open is a selection change (replace), so Back never walks a
  // click trail. A stale copy seed never carries into a plain create.
  const openCreate = () => {
    if (view === 'recurring') {
      navigate('/planned/rules/new')
      return
    }
    if (!isDesktop) {
      navigate('/planned/new')
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete('copy')
    const search = next.toString()
    navigate(search ? `/planned/new?${search}` : '/planned/new', { replace: itemPanelOpen })
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
            {/* Under 640 this button is the view switch (the segmented row is
                hidden below sm): opens the recurring view, toggles back from
                it - the same param write the segmented control performs. */}
            <button
              type="button"
              onClick={() => updateParams({ view: view === 'recurring' ? null : 'recurring' })}
              aria-pressed={view === 'recurring'}
              title={rulesButtonLabel}
              aria-label={rulesButtonLabel}
              className={
                'sm:hidden shrink-0 flex items-center justify-center rounded-sm transition-colors ' +
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
                `${controlHeightClass} pointer-coarse:min-w-[44px] ` +
                (view === 'recurring'
                  ? 'bg-primary text-white hover:bg-primary/90'
                  : 'text-text-muted hover:text-text hover:bg-surface-hover')
              }
            >
              <Repeat size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
            {/* Planned and recurring creation lives on this tab, not behind
                the FAB - the button is visible on every tier, phones
                included, because nothing else offers it. */}
            {canWrite && (
              <button
                type="button"
                onClick={openCreate}
                className={primaryButtonClass}
              >
                <Plus size={13} className="inline mr-1" /> {view === 'recurring' ? t('recurring.newRecurring') : t('newPlanned')}
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
        // skeleton shapes approximate the control rows the defaults feed
        // (view tabs, month stepper, status tabs, search/filter row) plus
        // the page's own list-row idiom.
        skeletonShown ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-8 w-56 max-sm:w-full bg-surface-muted rounded-sm animate-pulse" />
            <div className="h-10 w-40 bg-surface-muted rounded-sm animate-pulse" />
            <div className="h-8 w-64 max-sm:w-full bg-surface-muted rounded-sm animate-pulse" />
            <div className="h-10 bg-surface-muted rounded-sm animate-pulse" />
            <div className="space-y-2 pt-1">
              {[0, 1, 2].map((i) => <div key={i} className="h-12 bg-surface-muted rounded-sm animate-pulse" />)}
            </div>
          </div>
        ) : null
      ) : (
        <PlannedContent settings={settings} calendarStartDay={calendarStartDay} />
      )}
    </div>
  )
}

interface PlannedContentProps {
  /** Member-settings blob resolved by the arrival gate; undefined only when
      the settings query errored (built-ins apply). */
  settings: UserWorkspaceSettings | undefined
  /** Calendar start day (1 = Monday .. 7 = Sunday) for the week default. */
  calendarStartDay: number
}

function PlannedContent({ settings, calendarStartDay }: PlannedContentProps) {
  const { t } = useTranslation('planned')
  const { t: tBookmarks } = useTranslation('bookmarks')
  const { t: tCommon } = useTranslation('common')
  // Shared filter strings live in the transactions namespace (the
  // established cross-page home); all namespaces are eagerly loaded, so a
  // second translator here is safe (the shared filter components'
  // precedent).
  const { t: tTx } = useTranslation('transactions')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { canWrite } = usePermissions()
  // The role is unknown until the workspace loads: the pay path must not
  // bounce a member whose role has not resolved yet.
  const { isLoading: workspaceLoading } = useWorkspace()
  const multiCurrency = useMultiCurrency()
  const { data: accounts = [] } = useAccounts(false)
  const { data: currencies = [] } = useEnabledCurrencies()
  // Facet lists for the filter registry (availability + summaries). Shared
  // cache entries: the same keys the editors' option lists read, so one
  // fetch per stale window with the toolbar closed.
  const { data: budgets = [] } = useBudgets(false)
  const { data: categories = [] } = useWorkspaceCategories(false)

  const isTouch = useIsTouch()
  const { isMobile, isDesktop } = useBreakpoint()

  const statusOptions = STATUS_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
  const sortOptions = SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
  const statusLabel = (value: StatusFilter) => t(STATUS_OPTIONS.find((o) => o.value === value)!.labelKey)

  // Resolved in the body, not inside the JSX: the literal-string lint only
  // recognizes the unaliased t() callee, in attributes and children alike.
  const addBookmarkTitle = tBookmarks('addPlannedAria')
  const addLabel = tBookmarks('addLabel')
  const byBudgetAria = tTx('listFilters.byBudgetAria')
  const byCategoryAria = tTx('listFilters.byCategoryAria')

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

  const [deleting, setDeleting] = useState<PlannedTransaction | null>(null)
  // Skip asks first, like delete: the icon sits beside one-tap actions, and
  // a stray tap must not change an item's status.
  const [skipping, setSkipping] = useState<PlannedTransaction | null>(null)
  // Bookmark capture of the planned view's filters (mount-per-use modal):
  // target derives from the URL at open time; renders only in view=planned.
  const [pageBookmarkOpen, setPageBookmarkOpen] = useState(false)

  // Recurring view state: the list's delete confirm. The rule form lives on
  // its own page and keeps its own state.
  const [deletingRule, setDeletingRule] = useState<RecurringTransaction | null>(null)
  // Switch state for the delete dialog's "also delete pending rows" row; reset
  // on every open so a previous session's toggle never leaks into the next.
  const [deleteRulePending, setDeleteRulePending] = useState(false)

  // Rule rows open the rule page; a push, so Back returns to this list.
  const openRulePage = (r: RecurringTransaction) => navigate(`/planned/rules/${r.id}`)
  // "Make recurring": the rule page prefills from the pending row and adopts
  // it as the rule's first occurrence (adopt_planned_id) - no duplicate row
  // is created.
  const openMakeRecurring = (p: PlannedTransaction) => navigate(`/planned/rules/new?adopt=${p.id}`)
  const openDeleteRule = (r: RecurringTransaction) => { setDeleteRulePending(false); setDeletingRule(r) }

  // Filter state lives in the URL: shareable, bookmarkable, back-button friendly.
  const [searchParams, setSearchParams] = useSearchParams()
  // At 1024+ this page hosts an item's panel (its record or the pay form).
  // The open
  // item is the PATH, so bookmarks and saved defaults, which capture query
  // params only, can never record an open panel. The id comes from the
  // pattern that matched, never from the bare route-params hook (which also
  // reports an id on the rule paths, and on /planned/new). Garbage ids read
  // as null: no panel.
  const recordMatch = useMatch('/planned/:id')
  const payMatch = useMatch('/planned/:id/pay')
  const idParam = (recordMatch ?? payMatch)?.params.id ?? ''
  const panelId = /^\d+$/.test(idParam) && Number(idParam) > 0 ? Number(idParam) : null
  // The pay form owns the panel slot on the pay path.
  const payOpen = payMatch !== null
  // The create form's open state is its path: at 1024+ /planned/new renders
  // this list with the create form in the panel beside it, for writers only
  // (a viewer's deep link to the create path shows the plain list). The
  // create form wins the panel slot over a record. The copy seed rides on
  // the same path as ?copy=<id>; garbage reads as a plain create.
  const newMatch = useMatch('/planned/new')
  const createOpen = isDesktop && canWrite && newMatch !== null
  const copyId = createOpen ? intParam(searchParams, 'copy') : null
  const createMode: 'create' | 'copy' = copyId !== null ? 'copy' : 'create'
  // Any panel that is already open makes a later open a selection change.
  const itemPanelOpen = createOpen || panelId != null
  // Shares the ['planned', 'detail', id] cache entry with the record page,
  // the pay page and the copy seed: one entry per id, refreshed by every
  // family-wide invalidation.
  const { data: record, isLoading: recordLoading, isError: recordError } = usePlannedTransaction(panelId)
  // Row-selected highlight: below 1024 this component never mounts on an
  // item path (the route element renders the page there instead).
  const selectedId = isDesktop ? panelId : null

  // Opening a record swaps the matched route element, which remounts this
  // page and drops focus to <body>: a keyboard user would have to Tab back
  // in before the walk continues. Refocus the SELECTED row once per mount.
  // A bare list mount finds no selected row, so nothing is focused. DOM-only,
  // and programmatic focus after a mouse interaction shows no focus ring.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus()
  }, [])

  // "Paid differently" opens the pay form. The tier fork lives INSIDE the
  // handler so the row stays mounted on every tier. At 1024+ the form is a
  // panel beside the list: the list filters travel in the URL so the list
  // keeps filtering beside the panel, the first open pushes and a later
  // selection change replaces (a create panel that is already open counts
  // too; read at click time: this render sits on an item path). Below 1024
  // the form is a page and the push carries the list's search in router
  // state instead.
  const openPay = (p: PlannedTransaction) => {
    if (isDesktop) {
      const next = new URLSearchParams(searchParams)
      next.delete('copy')
      navigate({ pathname: `/planned/${p.id}/pay`, search: next.toString() }, { replace: itemPanelOpen })
      return
    }
    navigate(`/planned/${p.id}/pay`, { state: { search: searchParams.toString() } })
  }

  // A row tap or click opens the record. The tier fork lives INSIDE the
  // handler so the row stays mounted on every tier. At 1024+ the record is
  // a panel, the FIRST open pushes (Back returns to the bare list) and
  // every later selection change replaces (Back never walks a click
  // trail; a create panel that is already open counts too); below 1024
  // the PUSH carries the click-time search string in router state, so the
  // record page's back target keeps the filters.
  const handleOpenRecord = (p: PlannedTransaction) => {
    if (isDesktop) {
      const next = new URLSearchParams(searchParams)
      next.delete('copy')
      navigate({ pathname: `/planned/${p.id}`, search: next.toString() }, { replace: itemPanelOpen })
      return
    }
    navigate(`/planned/${p.id}`, { state: { search: searchParams.toString() } })
  }

  // Panel close (X, Escape, a finished pay, a delete, or the reconcile
  // below): replace keeps the closed item's URL out of Back's path; every
  // list param survives.
  const handleClosePanel = () =>
    navigate({ pathname: '/planned', search: searchParams.toString() }, { replace: true })
  // Copy opens the create form prefilled from the row, with today's date.
  // The tier fork lives INSIDE the handler so the hover button stays
  // mounted on every tier: at 1024+ the form is a panel beside this list
  // (the search travels in the URL so the list keeps filtering), and a
  // panel that is already open makes this a selection change (replace);
  // below 1024 the create page opens with a push.
  const openCopy = (p: PlannedTransaction) => {
    if (isDesktop) {
      const next = new URLSearchParams(searchParams)
      next.set('copy', String(p.id))
      navigate(`/planned/new?${next.toString()}`, { replace: itemPanelOpen })
      return
    }
    navigate(`/planned/new?copy=${p.id}`)
  }

  // Create panel close (X, Escape, Cancel, the unsaved-changes confirm, or a
  // successful Add): the list path with the search kept, minus the copy
  // seed - a stale ?copy= must not re-seed the next create. Replace, like
  // every panel close.
  const closeCreatePanel = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('copy')
    const search = next.toString()
    navigate(search ? `/planned?${search}` : '/planned', { replace: true })
  }
  // The record's action callbacks for the panel host: leaving the record
  // closes the panel. "Paid differently..." is openPay itself (a panel is
  // already open, so it replaces and the pay form takes the same slot). The
  // rule page is a full page at every tier for now, a push, so its back
  // arrow returns to this panel. Copy goes through the row's own opener.
  const handleRecordDeleted = () => handleClosePanel()
  const handleRecordMakeRecurring = (p: PlannedTransaction) => navigate(`/planned/rules/new?adopt=${p.id}`)
  const handleRecordCopy = openCopy
  // Session defaults, restoredSearch pattern generalized to every facet:
  // the lazy initializer computes the latch ONCE from the resolved settings
  // and the mount-time URL (buildDefaultsLatch is pure) - a mount WITH any
  // param of a facet never defaults that facet (a partial date deep link
  // kills only the range latch; the missing bound is never auto-filled).
  // A facet is null in the latch when its params are present, when the
  // stored value equals the page built-in, or when a bounded range resolves
  // to 'all' - null means "write nothing", so a fresh all-null blob latches
  // only the built-in current month, exactly the pre-feature behavior.
  // Consumed - never re-applies - once a facet's param has been present
  // (see the adjusts below); a fresh mount re-initializes (accepted).
  const [defaultsLatch, setDefaultsLatch] = useState(() =>
    buildDefaultsLatch(settings, 'planned', searchParams, calendarStartDay),
  )
  const rawStatus = searchParams.get('status')
  // Effective status: an explicit valid param wins; absent falls back to the
  // still-live latch value (the same value the materialization effect below
  // is about to write into the URL), then the built-in 'all'. Garbage reads
  // as unset (status-filter idiom).
  const statusFilter: StatusFilter = STATUS_OPTIONS.some((o) => o.value === rawStatus)
    ? (rawStatus as StatusFilter)
    : (defaultsLatch.status ?? 'all')
  // View tab lives in the URL (?view=planned|recurring): shareable like
  // every other filter, and picking the default clears the param so the
  // common-case URL stays clean (status-filter idiom). The latch fallback is
  // only ever 'recurring' - a stored 'planned' equals the built-in and never
  // latches; garbage reads as planned.
  const rawView = searchParams.get('view')
  const view: 'planned' | 'recurring' =
    rawView === 'recurring' || (rawView === null && defaultsLatch.view === 'recurring') ? 'recurring' : 'planned'
  // Remembered search: when the URL carries no ?search= param (fresh visit),
  // the last committed term fills the box. Seeded once at mount (the lazy
  // useState initializer reads storage exactly once); after that the URL
  // param is the single source of truth.
  const [restoredSearch, setRestoredSearch] = useState(() =>
    searchParams.get('search') === null ? readStoredSearch() : '',
  )
  const search = searchParams.get('search') ?? restoredSearch
  // Toolbar search input (640+): the applied Search chip's body focuses
  // it. The phone instance needs no ref - the chips row is hidden below
  // sm, so the chip cannot be clicked there.
  const searchInputRef = useRef<HTMLInputElement>(null)
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
  const rawOrdering = searchParams.get('ordering')
  // Effective range, consumed latch: all reads below (list, totals, filter
  // count) use the EFFECTIVE range - explicit params win; both absent falls
  // back to the still-live default; a PARTIAL range (one bound) passes
  // through as-is - the missing bound is never auto-filled. Every filter
  // surface reads these same effective derivations, so no visible mismatch
  // exists before materialization, and after it raw == effective.
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
  if (defaultsLatch.status && rawStatus !== null) setDefaultsLatch((l) => ({ ...l, status: null }))
  if (defaultsLatch.view && rawView !== null) setDefaultsLatch((l) => ({ ...l, view: null }))
  if (defaultsLatch.ordering && rawOrdering !== null) setDefaultsLatch((l) => ({ ...l, ordering: null }))
  const dateFrom = rawFrom ?? defaultsLatch.range?.from ?? ''
  const dateTo = rawTo ?? defaultsLatch.range?.to ?? ''
  const page = intParam(searchParams, 'page') ?? 1
  // Garbage ?ordering= values read as unset (status-filter idiom): the Select
  // shows the default placeholder and the request sends nothing. Absent
  // falls back to the still-live latch value before materialization.
  const ordering = SORT_OPTIONS.some((o) => o.value === rawOrdering)
    ? (rawOrdering as PlannedTransactionOrdering)
    : defaultsLatch.ordering

  const [pageSize, setPageSize] = useState(getStoredPageSize)

  const updateParams = createUpdateParams(setSearchParams)

  // One-shot defaults materialization (useStalePageReset shape: the URL
  // write goes through the closure-wrapped updateParams, never
  // setSearchParams directly - the shipped precedent for a no-event URL
  // write from an effect; a render-adjust must not write router state).
  // Fires only while a latch facet is live: entering with a facet's params
  // absent writes the resolved default into the URL (replace, no history
  // entry). The write touches ONLY the five defaultable param families
  // (status/view/ordering/from/to) plus createUpdateParams's automatic
  // ?page drop - never another facet's params. The consume adjusts above
  // then kill the consumed facets, so All time / Clear filters / deep
  // links never re-default within a session; a fresh mount re-initializes
  // the latch (accepted). Not gated on the view tab: the write may carry ?view=
  // itself, and on a ?view=recurring entry the planned-view facets (range,
  // status, ordering) are inert on the recurring surface and already
  // applied when the user switches tabs.
  useEffect(() => {
    if (!defaultsLatch.range && !defaultsLatch.status && !defaultsLatch.view && !defaultsLatch.ordering) return
    updateParams({
      ...(defaultsLatch.range ? { from: defaultsLatch.range.from, to: defaultsLatch.range.to } : {}),
      ...(defaultsLatch.status ? { status: defaultsLatch.status } : {}),
      ...(defaultsLatch.view ? { view: defaultsLatch.view } : {}),
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

  // Shared clear path for the search facet (Clear all and the Search
  // chip's X): the URL param alone is NOT enough - `search = param ??
  // restoredSearch` re-applies the remembered term on the very next
  // render when only the param dies (the re-apply hazard), so the
  // restored hint and the stored value die in the same handler.
  const forgetStoredSearch = () => {
    setRestoredSearch('')
    try {
      localStorage.setItem(SEARCH_STORAGE_KEY, '')
    } catch {
      // Storage unavailable: remembering is best-effort.
    }
  }

  // Each facet counts once, however many values it holds. Default-derived
  // params still count: a materialized default range IS an active range
  // (badge 1 with the panel closed is honest - the user can see and clear
  // what is filtering the list), so materialized params are never excluded.
  const filterLookups = {
    accounts,
    budgets,
    categories,
    multiCurrency,
    selectedCount: (count: number) => tCommon('multiSelect.selectedCount', { count }),
  }
  const filterDefs = buildPlannedFilters(filterLookups)
  const filterValues = {
    search,
    account: accountFilter,
    currency: currencyFilter,
    budget: budgetFilter,
    category: categoryFilter,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
  }
  const activeCount = activeFilterCount(filterDefs, filterValues, filterLookups)

  // Exact-calendar-month detection on the EFFECTIVE range: truthy only when
  // from/to are a calendar month's first and last day. The month label and
  // the month-aware empty state below key off it.
  // A week or year default range is simply not an exact calendar month, so
  // the stepper and the month-aware empty state hide for those defaults -
  // isCalendarMonth on the EFFECTIVE range already expresses this; no extra
  // default-specific branch exists or is needed.
  const exactMonth = isCalendarMonth(dateFrom, dateTo)
  const monthLabel = exactMonth ? formatMonthYear(dateFrom) : null
  // The date facet is the ONLY filter and it is an exact month - ANY month,
  // the default or one the user arrived at: the generic "filtered" empty
  // message would be misleading, the empty state gets the month treatment.
  const onlyMonthRange = activeCount === 1 && !!exactMonth

  // The phone filter sheet opens only through its trigger - never
  // automatically. Deep links and bookmarks apply their filters silently;
  // the trigger's badge count is the visible signal that filters are
  // active (the default-month materialization write lands as badge 1).
  const [sheetOpen, setSheetOpen] = useState(false)
  // Tier crossing: the sheet is phone-only and the 640+ toolbar row is
  // CSS-gated, so a crossing closes the departing surface - an open sheet
  // surviving an up-crossing would resurrect on rotate-back. Every filter
  // change is already on the URL, so no other state needs preserving.
  // Loop-safe by construction (each write lands on a value that disproves
  // its own guard); StrictMode-idempotent.
  const [prevMobile, setPrevMobile] = useState(isMobile)
  if (prevMobile !== isMobile) {
    setPrevMobile(isMobile)
    if (!isMobile) setSheetOpen(false)
  }

  // Clears URL params only - saved defaults (if any) are untouched: the
  // next fresh entry re-materializes them. Clearing is the user's explicit
  // all-time choice for THIS session (the latch is consumed).
  const clearFilters = () => {
    // clearAllFilters already includes the search def's { search: null }
    // URL write; the remembered value dies here in the same handler.
    forgetStoredSearch()
    updateParams(clearAllFilters(filterDefs))
  }

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

  // Stepper label for the always-visible month window: the same month shape
  // the month-aware empty state's heading shows for exact months, the short
  // range / single-bound / All time shapes otherwise.
  const stepperLabel = stepperRangeLabel(dateFrom, dateTo, tTx('listFilters.presetAllTime'))

  // Applied-filter chips: every active registry filter except date (the
  // stepper owns the date). Badge and chips read the same isActive, so a
  // materialized default facet shows as a chip exactly when it counts.
  // Label resolution goes through the planned-ns t(): plain labelKeys live
  // in this namespace, cross-namespace ones carry the 'transactions:'
  // prefix any t() resolves. Amount summaries render font-mono; name/
  // "N selected" summaries stay in the UI font. Typed i18next only accepts
  // a dynamic key alongside an explicit fallback, so the fallback mirrors
  // the key (every landed labelKey resolves; a missing one would render its
  // own key - immediately visible, never a silent blank).
  const filterLabel = (key: string) => t(key, { defaultValue: key })
  const appliedChips: AppliedFilterChip[] = filterDefs
    .filter((d) => d.id !== 'date' && d.isActive(filterValues, filterLookups))
    .map((d) => ({
      id: d.id,
      label: filterLabel(d.labelKey),
      summary:
        d.id === 'search' ? (
          // Free UNBOUNDED text, unlike the bounded name/count/date
          // fragments: cap + ellipsize so one long term cannot stretch
          // the wrapping chips row. inline-block because max-width never
          // applies to a bare inline span; align-bottom because an
          // overflow-hidden inline-block loses the text baseline (its
          // baseline becomes its bottom margin edge), which would sit
          // the fragment slightly above the label.
          <span className="inline-block max-w-[16rem] truncate align-bottom">
            {d.summarize(filterValues, filterLookups)}
          </span>
        ) : d.editor === 'amount' ? (
          <span className="font-mono">{d.summarize(filterValues, filterLookups)}</span>
        ) : (
          d.summarize(filterValues, filterLookups)
        ),
      onRemove: () => {
        // The search facet clears three ways at once (URL param + stored
        // value + restored hint) - see forgetStoredSearch.
        if (d.id === 'search') forgetStoredSearch()
        updateParams(d.clear())
      },
      // The search chip's body focuses the search input (it has no
      // editor popover): AppliedFilters suppresses this chip's
      // haspopup/expanded whenever onBodyClick is present.
      onBodyClick: d.id === 'search' ? () => searchInputRef.current?.focus() : undefined,
    }))

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
  // prefix refetches the strip too.
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

  // Editor bodies for every filter-editor host (the phone sheet's editor
  // level and the toolbar's popovers): each def wired with the options and
  // URL writes above (shared-filter labels resolve through the
  // transactions namespace, the established cross-page home). One wiring,
  // two hosts - the surfaces never diverge.
  const renderFilterEditor = (def: FilterDef<PlannedFilterValues, FilterLookups>) => {
    switch (def.id) {
      case 'date':
        return (
          <DateRangeEditor
            value={{ from: dateFrom, to: dateTo }}
            onChange={(n) => updateParams({ from: n.from, to: n.to })}
          />
        )
      case 'search':
        // Unreachable: hosts never route the search def to an editor
        // surface (the always-visible input IS its editor). Guard so a
        // future host that forgets the skip renders nothing instead of
        // silently falling through.
        return null
      case 'account':
        return (
          <MultiChoiceEditor
            value={accountFilter}
            onChange={(v) => updateParams({ account: v })}
            options={accountOptions}
            aria-label={t('filters.byAccountAria')}
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
            aria-label={byBudgetAria}
          />
        )
      case 'category':
        return (
          <MultiChoiceEditor
            value={categoryFilter}
            onChange={(v) => updateParams({ category: v })}
            options={categoryOptions}
            searchable
            aria-label={byCategoryAria}
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

  // Paying, skipping and restoring an item share one hook: the cache refresh
  // and the toasts live there, and every caller here (the row buttons and the
  // skip dialog) reaches for the same functions.
  const { markPaid, skip, isPending: paymentPending } = usePlannedPayment()

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plannedTransactionsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['planned'] }); toast.success(t('deleted')); setDeleting(null) },
    onError: (error) => { toast.error(getApiErrorMessage(error, t('deleteFailed'))); setDeleting(null) },
  })

  // Pause/resume: full-replace PUT, so echo the row's fields with only
  // is_active flipped (the full-replace echo pattern). Planned rows never
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

  // Save the current view facets as this page's defaults. capturePageDefaults
  // reads the URL (the source of truth) into the full planned sub-object - a
  // present page key is a full replace, so every facet is always sent.
  // Toasts are per-call callbacks: the shared hook owns only the cache
  // invalidation (BookmarksPage's per-call onError precedent).
  const updateSettings = useUpdateWorkspaceSettings()
  const handleSaveDefaults = () => {
    updateSettings.mutate(
      { planned: capturePageDefaults(searchParams, 'planned', calendarStartDay) },
      {
        onSuccess: () => toast.success(t('saveDefaultsSuccess')),
        onError: (error) => toast.error(getApiErrorMessage(error, t('saveDefaultsFailed'))),
      },
    )
  }

  // Filter facets only - ordering, page and page size do not change membership.
  const filterKey = [statusFilter, search, accountFilter.join(','), currencyFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo].join('|')
  // Keep-or-close reconcile for the open panel: a filter change (or an
  // item error - deleted elsewhere, foreign) that proves the item no
  // longer matches the query closes the panel; a still-matching item stays
  // open even when it falls off the visible page. The pay path also swaps
  // to the record for anything that cannot be paid there (the pay page
  // redirects the same cases). Response arrival is not an event, so a
  // guarded effect is the only possible seam, and it navigates (a router
  // write, never component state).
  useEffect(() => {
    if (!(isDesktop && panelId != null)) return
    if (recordLoading) return
    if (recordError || !record) {
      handleClosePanel()
      return
    }
    if (payOpen && !workspaceLoading && (!canWrite || record.status !== 'pending')) {
      navigate({ pathname: `/planned/${record.id}`, search: searchParams.toString() }, { replace: true })
      return
    }
    if (!plannedStillMatches(record, { status: statusFilter, search, account: accountFilter, currency: currencyFilter, budget: budgetFilter, category: categoryFilter, amountMin, amountMax, dateFrom, dateTo })) {
      handleClosePanel()
    }
    // The effect reads the CURRENT filter values by design; filterKey is
    // the change signal, so the deps list is deliberately partial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, panelId, isDesktop, payOpen, record, recordLoading, recordError, canWrite, workspaceLoading])

  // The pay form mounts only for an item it can pay: anything else on the
  // pay path holds until the reconcile above swaps or closes the panel.
  const payable =
    record && record.status === 'pending' && canWrite && !workspaceLoading ? record : null

  return (
    <>
      {/* View switch for 640px and up, above the status control: it swaps
          the whole page surface. Below 640 the header's recurring-rules
          button owns the toggle instead. */}
      <div className="mb-3 hidden sm:block">
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
          Phone-only row: its 640+ twin is the toolbar's stepper member
          below (CSS-gated dual embed; the state is the URL). Always
          present in the planned view: custom ranges and All time keep the
          label-only stepper as the date entry point, with arrows only
          while the range is an exact calendar month. The label opens the
          phone filter sheet. */}
      {view === 'planned' && (
        <div className="sm:hidden">
          <MonthStepper
            label={stepperLabel}
            onShift={exactMonth ? handleMonthShift : undefined}
            onOpenEditor={() => setSheetOpen(true)}
          />
        </div>
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

      {/* 640+ toolbar (planned view only - the recurring view has no
          filter UI at all): stepper (its label opens the date editor
          popover), applied chips (a chip opens its filter's editor), Add
          filter, search, sort, and the Save view menu. Hidden below 640,
          where the sheet is the filter surface. */}
      {view === 'planned' && (
        <FilterChipsBar
          filters={filterDefs}
          values={filterValues}
          lookups={filterLookups}
          filterLabel={filterLabel}
          chips={appliedChips}
          onClearAll={clearFilters}
          renderEditor={renderFilterEditor}
          renderStepper={({ openDateEditor, dateEditorOpen }) => (
            <MonthStepper
              inline
              label={stepperLabel}
              onShift={exactMonth ? handleMonthShift : undefined}
              onOpenEditor={openDateEditor}
              editorOpen={dateEditorOpen}
            />
          )}
          search={
            <SearchInput
              value={search}
              onChange={handleSearchChange}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchAria')}
              className="flex-1 min-w-40 max-w-sm"
              inputRef={searchInputRef}
            />
          }
          sort={
            <Select
              value={ordering}
              onChange={(v) => updateParams({ ordering: v === DEFAULT_SORT ? null : v })}
              options={sortOptions}
              placeholder={t('sort.soonest')}
              aria-label={t('sortAria')}
              className="w-48 shrink-0"
            />
          }
          saveView={{
            onSaveDefaults: handleSaveDefaults,
            saveDefaultsLabel: t('saveDefaults'),
            saveDefaultsPending: updateSettings.isPending,
            saveDefaultsPendingLabel: t('saveDefaultsPending'),
            onSaveBookmark: () => setPageBookmarkOpen(true),
            bookmarkLabel: addLabel,
          }}
        />
      )}

      {/* Below sm the row holds the search box (full wrap line) and the
          phone Filters trigger; the bookmark/save/sort actions live in the
          phone filter sheet's save rows. Phones therefore carry three
          control rows in this view (month stepper, status, search +
          filters) - folding search into the sheet is a planned later trim,
          deliberately not done here. */}
      {view === 'planned' && (
      <div className="flex max-sm:flex-wrap gap-2 mb-3 sm:hidden">
        <SearchInput
          value={search}
          onChange={handleSearchChange}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchAria')}
          className="flex-1 min-w-0 max-w-sm max-sm:max-w-none max-sm:basis-full"
        />
        <FiltersTrigger open={sheetOpen} count={activeCount} onOpen={() => setSheetOpen(true)} />
      </div>
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

      {/* The list and its pagination always ride the split's list slot:
          with no panel open the wrapper renders the list unchanged, so one
          stable tree spans the 1024 crossing. The toolbar above keeps the
          page's full width. */}
      <SplitView
        list={
          view === 'planned' ? (
            isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-surface-muted rounded-sm animate-pulse" />)}</div>
            ) : items.length === 0 ? (
              search || (activeCount > 0 && !onlyMonthRange) ? (
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
              <div ref={listRef} className="border border-border rounded-sm bg-surface divide-y divide-border">
                {items.map((p) => (
                  <SwipeRow
                    key={p.id}
                    enabled={isTouch && canWrite && p.status === 'pending'}
                    actions={[
                      { key: 'paidDifferently', label: t('rowActions.paidDifferentlyShort'), icon: SlidersHorizontal, onSelect: () => openPay(p) },
                      { key: 'delete', label: t('rowActions.delete'), icon: Trash2, destructive: true, onSelect: () => setDeleting(p) },
                    ]}
                  >
                    <div
                      {...tappableProps(() => handleOpenRecord(p))}
                      aria-current={p.id === selectedId ? 'true' : undefined}
                      className={`flex items-center justify-between px-4 py-3 text-sm group border-l-2 active:bg-surface-hover transition-colors cursor-pointer ${
                        p.id === selectedId ? 'border-l-primary bg-surface-hover' : 'border-l-transparent'
                      }`}
                    >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-text truncate">{p.name}</span>
                        <PlannedStatusChip planned={p} />
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
                    <div className="flex items-center gap-3 shrink-0 pl-3">
                      <span className="font-mono text-text whitespace-nowrap">{formatAmount(p.amount)} {multiCurrency ? p.currency_code : ''}</span>
                      {/* Hover and keyboard focus reveal the action group on a fine
                          pointer; at every pointer type the row itself opens the
                          record. The wrapper stops a button's click and key
                          presses before they reach the row's handlers: the action
                          must run alone, never double-fire. */}
                      {canWrite && !isTouch && (
                        <div
                          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {p.status === 'pending' && (
                            <button type="button" onClick={() => markPaid(p)} disabled={paymentPending} title={t('rowActions.markPaid')} aria-label={t('rowActions.markPaid')} className="text-text-muted hover:text-positive p-1"><CheckCircle size={13} /></button>
                          )}
                          {p.status === 'pending' && (
                            <button
                              type="button"
                              onClick={() => openPay(p)}
                              title={t('rowActions.paidDifferently')}
                              aria-label={t('rowActions.paidDifferently')}
                              className="text-text-muted hover:text-positive p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                            >
                              <SlidersHorizontal size={13} />
                            </button>
                          )}
                          {p.status === 'pending' && (
                            <button type="button" onClick={() => setSkipping(p)} disabled={paymentPending} title={t('rowActions.skip')} aria-label={t('rowActions.skip')} className="text-text-muted hover:text-text p-1"><Ban size={13} /></button>
                          )}
                          {p.status === 'pending' && p.recurring_id == null && (
                            <button type="button" onClick={() => openMakeRecurring(p)} title={t('recurring.makeRecurring')} aria-label={t('recurring.makeRecurring')} className="text-text-muted hover:text-text p-1"><Repeat size={13} /></button>
                          )}
                          <button onClick={() => openCopy(p)} title={t('rowActions.copy')} className="text-text-muted hover:text-text p-1"><Copy size={13} /></button>
                          <button onClick={() => setDeleting(p)} title={t('rowActions.delete')} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                    </div>
                  </SwipeRow>
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
                  {...(canWrite ? tappableProps(() => openRulePage(r)) : {})}
                  className={`flex items-center justify-between px-4 py-3 text-sm group ${canWrite ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''}`}
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
                  <div className="flex items-center gap-3 shrink-0 pl-3">
                    <span className="font-mono text-text whitespace-nowrap">{formatAmount(r.amount)} {multiCurrency ? r.currency_code : ''}</span>
                    {/* Hover reveals are pointer-fine only; at every pointer type
                        the writer's row itself is a button that opens the rule
                        page (click, tap, Enter or Space). A viewer's row is inert:
                        the rule page sends a viewer straight back to this list.
                        The group also shows while the row or one of its buttons
                        holds focus, so a keyboard user sees the actions they tab
                        through. The wrapper stops a button's click AND keydown
                        before they bubble into the row's handlers: without the
                        keydown twin, Enter or Space on a focused button would
                        open the page over the button's own action. The action
                        must run alone, never double-fire. */}
                    {canWrite && !isTouch && (
                      <div
                        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <button type="button" onClick={() => openRulePage(r)} title={t('recurring.rowActions.edit')} aria-label={t('recurring.rowActions.edit')} className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
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
          )
        }
        panel={
          createOpen ? (
            // The create form wins the panel slot over a record.
            <PlannedCreatePanel mode={createMode} copyId={copyId} onClose={closeCreatePanel} />
          ) : isDesktop && panelId != null ? (
            // The pay form is a writer's: the slot takes it only for a
            // member who can pay, so a viewer on the pay path sees the
            // record from the first paint, never the pay form. The
            // reconcile above then moves the URL to the record path.
            payOpen && canWrite ? (
              // Hold, never flash: the form needs an item it can pay, and
              // anything else swaps to the record or closes through the
              // reconcile above.
              <DetailPanel title={t('pay.title')} onClose={handleClosePanel}>
                {payable ? (
                  <PlannedPayBody planned={payable} onClose={handleClosePanel} />
                ) : (
                  <PanelHold />
                )}
              </DetailPanel>
            ) : (
              // The record renders its own actions in the body, so the
              // panel shell passes no footer. The title falls back to the
              // generic record label only for the loading window; once
              // loaded the item's name is the title.
              // On the pay path the record holds until the role is known:
              // a writer must not see their own record flash read-only
              // before the pay form.
              <DetailPanel title={record?.name ?? t('record.title')} onClose={handleClosePanel}>
                {recordLoading || (payOpen && workspaceLoading) ? (
                  <PanelHold />
                ) : record ? (
                  <PlannedRecord
                    planned={record}
                    canWrite={canWrite}
                    onDeleted={handleRecordDeleted}
                    onPayDifferently={openPay}
                    onMakeRecurring={handleRecordMakeRecurring}
                    onCopy={handleRecordCopy}
                  />
                ) : null}
              </DetailPanel>
            )
          ) : null
        }
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
        isOpen={!!skipping}
        destructive={false}
        title={t('skipDialog.title')}
        message={t('skipDialog.message', { name: skipping?.name })}
        confirmLabel={t('skipDialog.confirm')}
        isPending={paymentPending}
        onConfirm={async () => { if (skipping) { await skip(skipping); setSkipping(null) } }}
        onCancel={() => setSkipping(null)}
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
      {/* Mounted before the bookmark modal so the chained modal (opened by
          the sheet's bookmark row, which closes the sheet first) stacks
          above the sheet during its exit animation. The recurring view gets
          no filter UI, sheet included. */}
      {view === 'planned' && isMobile && (
        <FilterSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          filters={filterDefs}
          values={filterValues}
          lookups={filterLookups}
          filterLabel={filterLabel}
          updateParams={updateParams}
          renderEditor={renderFilterEditor}
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
          pageContext={{ kind: 'planned', params: paramsFromSearchParams(searchParams) }}
          onClose={() => setPageBookmarkOpen(false)}
        />
      )}
    </>
  )
}

/** Hold-while-loading pulse for a panel whose item is still loading: hold,
 *  never flash an empty panel. */
function PanelHold() {
  return (
    <div className="space-y-3 pt-2" aria-hidden="true">
      <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
      <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
    </div>
  )
}

interface PlannedPayBodyProps {
  planned: PlannedTransaction
  onClose: () => void
}

/** The "Paid differently" form for one loaded pending item, inside the panel
 *  body: the fields, then the action row at the END OF THE BODY - never the
 *  panel's footer prop. The panel stretches to the list's height, so a
 *  pinned footer would sit at the list's bottom, below the fold on a long
 *  list; the negative margins and the padding below reuse the footer's own
 *  box. A child component rather than an inline branch of the page, so the
 *  form hook always mounts with its item. */
function PlannedPayBody({ planned, onClose }: PlannedPayBodyProps) {
  const { t } = useTranslation('planned')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const form = usePayPlannedForm(planned)

  const handleSubmit = async () => {
    if (!(await form.submit())) return
    // Replace: the finished form leaves Back's path, and the record takes
    // the panel slot with the paid state. The list search stays.
    navigate({ pathname: `/planned/${planned.id}`, search: searchParams.toString() }, { replace: true })
  }

  return (
    <>
      <PayPlannedForm form={form} planned={planned} />
      <div className="-mx-4 -mb-4 mt-4 border-t border-border p-4">
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            {t('form.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={form.isSaving}
            className={`${primaryButtonClass} inline-flex items-center justify-center gap-1.5`}
          >
            {form.isSaving ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                {t('pay.submitting')}
              </>
            ) : (
              t('pay.submit')
            )}
          </button>
        </div>
      </div>
    </>
  )
}
