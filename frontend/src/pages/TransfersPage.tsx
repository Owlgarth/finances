import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeftRight, Plus, Repeat, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { transfersApi } from '../api/client'
import type { Transfer, UserWorkspaceSettings } from '../types'
import { useAccounts } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from '../hooks/useWorkspaceSettings'
import { useActivityScope } from '../hooks/useActivityScope'
import { useTransferForm } from '../hooks/useTransferForm'
import { formatAmount } from '../utils/format'
import { isCalendarMonth, shiftMonth } from '../utils/dates'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { createUpdateParams, intParam, useStalePageReset } from '../utils/params'
import { buildDefaultsLatch, capturePageDefaults } from '../utils/pageDefaults'
import { activeFilterCount, buildTransfersFilters, clearAllFilters, type FilterDef, type TransfersFilterLookups, type TransfersFilterValues } from '../utils/listFilters'
import { useBreakpoint, useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'
import { type AppliedFilterChip } from '../components/common/AppliedFilters'
import MonthStepper, { stepperRangeLabel } from '../components/common/MonthStepper'
import DateQuickPick from '../components/common/DateQuickPick'
import { FiltersTrigger } from '../components/filters/FiltersTrigger'
import FilterSheet from '../components/filters/FilterSheet'
import FilterChipsBar from '../components/filters/FilterChipsBar'
import DateRangeEditor from '../components/filters/DateRangeEditor'
import SingleChoiceEditor from '../components/filters/SingleChoiceEditor'
import type { ChoiceOption } from '../components/filters/MultiChoiceEditor'
import ActivityTabs from '../components/layout/ActivityTabs'
import PageHeader from '../components/layout/PageHeader'
import DetailPanel from '../components/layout/DetailPanel'
import SplitView from '../components/layout/SplitView'
import AmountField from '../components/transactions/AmountField'
import TransferFormFields from '../components/transactions/TransferFormFields'
import TransferRecord from '../components/transactions/TransferRecord'
import { labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

// "All accounts" sentinel for the single-choice account editor in the phone
// filter sheet (entity ids are positive, so 0 never collides with a real
// account; picking it clears the param).
const NO_ACCOUNT = 0

// Arrival gate + page shell. The per-page defaults must resolve before the
// content mounts: a cold-cache materialization of built-ins would flip every
// control a moment later. Both gate queries are boot-time fetches with a
// staleTime, so warm by the time users reach the page - the gate binds on
// cold cache and workspace switch only. An errored settings query opens the
// gate with settings undefined and the content degrades to the page
// built-ins (pageDefaults normalizes undefined to all-null) rather than
// blocking the page.
export default function TransfersPage() {
  const { t } = useTranslation('transfers')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { isDesktop } = useBreakpoint()
  const { canWrite } = usePermissions()
  const { data: settings, isLoading: settingsLoading } = useWorkspaceSettings()
  const { isLoading: preferencesLoading, calendarStartDay } = useUserPreferences()
  const defaultsLoading = settingsLoading || preferencesLoading

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
  // Garbage reads as unset (the page's garbage-filter idiom).
  const newParam = searchParams.get('new')

  // Below 1024 the create entry is /new with this page's subject as the
  // type; the account filter (a single id here, read with intParam)
  // travels when set - the same exactly-one-id rule as the FAB carry.
  // The branch lives INSIDE the handler - the button stays mounted on
  // every tier. At 1024+ the ?new= param IS the create panel's open
  // state (shareable, reload-safe). REPLACE: an in-page selection write
  // is not a history step, so Back still leaves the page in one press.
  const handleCreate = () => {
    if (isDesktop) {
      const next = new URLSearchParams(searchParams)
      next.set('new', 'transfer')
      navigate(`/transfers?${next.toString()}`, { replace: true })
      return
    }
    const next = new URLSearchParams({ type: 'transfer' })
    const account = intParam(searchParams, 'account')
    if (account) next.set('account', String(account))
    navigate(`/new?${next.toString()}`)
  }

  const { activityTitle, breadcrumb } = useActivityScope()

  // Fall-through reset of the skeleton flag (lands on false, which disproves
  // its own guard - terminates by construction; StrictMode-idempotent).
  if (!defaultsLoading && skeletonShown) setSkeletonShown(false)

  // Save the current view facets as this page's defaults. The action lives
  // in the 640+ toolbar's Save view menu and the phone filter sheet's save
  // row - the handler and its mutation live here (above the arrival gate)
  // and thread down to the content. The capture helper reads the URL at
  // click time: the URL is the source of truth once the default has
  // materialized into it. Tradeoff: a click inside the brief cold-cache
  // gate window captures the pre-materialization URL (range 'all') - a
  // benign degradation; every click after materialization matches the
  // on-screen view. Toasts are per-call callbacks: the shared hook owns
  // only the cache invalidation. NOT gated on canWrite: defaults are
  // per-user, every role saves them.
  const updateSettings = useUpdateWorkspaceSettings()
  const handleSaveDefaults = () => {
    updateSettings.mutate(
      { transfers: capturePageDefaults(searchParams, 'transfers', calendarStartDay) },
      {
        onSuccess: () => toast.success(t('saveDefaultsSuccess')),
        onError: (error) => toast.error(getApiErrorMessage(error, t('saveDefaultsFailed'))),
      },
    )
  }

  // Below 1024 the create surface is /new: a ?new= URL loaded or resized
  // into that band redirects there. REPLACE: the ?new= URL is an
  // implementation detail of the desktop panel, not a history step.
  if (!isDesktop && newParam === 'transfer') {
    return <Navigate to="/new?type=transfer" replace />
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
            {/* Hidden on phones (the FAB owns creation there); on tablets
                below 1024 it navigates to /new?type=transfer, at 1024+ it
                opens the in-flow create panel. */}
            {canWrite && (
              <button type="button" onClick={handleCreate} className={`${primaryButtonClass} max-sm:hidden`}>
                <Plus size={13} className="inline mr-1" /> {t('actions.newTransfer')}
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
        // skeleton shapes approximate the filter toolbar (stepper + chips
        // row) plus this page's own list-row idiom - the same row height
        // as the list skeleton below.
        skeletonShown ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-24 bg-surface-muted rounded-sm animate-pulse" />
            <div className="space-y-2 pt-1">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}
            </div>
          </div>
        ) : null
      ) : (
        <TransfersContent
          settings={settings}
          calendarStartDay={calendarStartDay}
          onSaveDefaults={handleSaveDefaults}
          saveDefaultsPending={updateSettings.isPending}
        />
      )}
    </div>
  )
}

/** Conservative mirror of the list query's server filters: true only when
    the record provably still matches every facet the server applies. */
function transferStillMatches(tr: Transfer, account: number | null, dateFrom: string, dateTo: string): boolean {
  if (account != null && tr.from_account_id !== account && tr.to_account_id !== account) return false
  if (dateFrom && tr.date < dateFrom) return false
  if (dateTo && tr.date > dateTo) return false
  return true
}

interface TransfersContentProps {
  /** Member-settings blob resolved by the arrival gate; undefined only when
      the settings query errored (built-ins apply). */
  settings: UserWorkspaceSettings | undefined
  /** Calendar start day (1 = Monday .. 7 = Sunday) for the week default. */
  calendarStartDay: number
  /** Save-default action, threaded from the gate wrapper for the phone
      filter sheet and the 640+ Save view menu: the handler and its
      mutation live above the gate. */
  onSaveDefaults: () => void
  saveDefaultsPending: boolean
}

function TransfersContent({ settings, calendarStartDay, onSaveDefaults, saveDefaultsPending }: TransfersContentProps) {
  const { t } = useTranslation('transfers')
  // Shared filter strings live in the transactions namespace (the
  // established cross-page home); all namespaces are eagerly loaded, so a
  // second translator here is safe (the shared filter components'
  // precedent).
  const { t: tTx } = useTranslation('transactions')
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const isTouch = useIsTouch()
  const { isMobile, isDesktop } = useBreakpoint()
  const { data: accounts = [] } = useAccounts(false)
  const navigate = useNavigate()

  // Filter state lives in the URL (shareable, back-button friendly); any
  // filter change resets pagination via createUpdateParams.
  const [searchParams, setSearchParams] = useSearchParams()
  const account = intParam(searchParams, 'account')
  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')
  const page = intParam(searchParams, 'page') ?? 1
  const updateParams = createUpdateParams(setSearchParams)

  // Session defaults, restoredSearch pattern generalized to the one facet
  // this page can default (range): the lazy initializer computes the latch
  // ONCE from the resolved settings and the mount-time URL (the latch
  // builder is pure) - a mount WITH either date param never defaults the
  // range (a partial date deep link kills only the latch; the missing
  // bound is never auto-filled). Range is null in the latch when either
  // date param is present or when the resolved preset is 'all' - null
  // means "write nothing", so a fresh all-null blob (range 'all') latches
  // nothing and this page behaves exactly as before the feature.
  // Consumed - never re-applies - once either date param has been present
  // (see the adjust below); a fresh mount re-initializes (accepted).
  const [defaultsLatch, setDefaultsLatch] = useState(() =>
    buildDefaultsLatch(settings, 'transfers', searchParams, calendarStartDay),
  )

  // Consume adjust - a fall-through render-adjust on local state (the
  // sanctioned shape; never an effect, never router state). The
  // materialization write below lands the range at once; the FUNCTIONAL
  // updater is load-bearing for the siblings' multi-facet case and keeps
  // this page's shape identical to theirs. The updater lands on a value
  // that disproves its own guard - the adjust terminates by construction;
  // hooks below stay unconditional; on the pass where it fires the params
  // already win the derivations, so no query key churns.
  if (defaultsLatch.range && (rawFrom !== null || rawTo !== null)) setDefaultsLatch((l) => ({ ...l, range: null }))

  // Effective range - all reads below (list query, filter badge, empty
  // state) use the EFFECTIVE range: explicit params win; both absent falls
  // back to the still-live default (the same value the materialization
  // effect below is about to write into the URL); a PARTIAL range (one
  // bound) passes through as-is - the missing bound is never auto-filled.
  const dateFrom = rawFrom ?? defaultsLatch.range?.from ?? ''
  const dateTo = rawTo ?? defaultsLatch.range?.to ?? ''

  const [pageSize, setPageSize] = useState(getStoredPageSize)

  // Default-derived from/to count exactly as user-set ones: a materialized
  // default range IS an active filter, so a visible applied-filter state on
  // fresh entry with a defaulted range is honest - the user can see and
  // clear what is filtering the list. Every surface reads these same
  // effective values, so no surface shows a range the list is not
  // filtered by.
  const filterLookups = { accounts }
  const filterDefs = buildTransfersFilters(filterLookups)
  const filterValues = { account, dateFrom, dateTo }
  const activeCount = activeFilterCount(filterDefs, filterValues, filterLookups)
  const hasFilters = activeCount > 0

  // Phone filter sheet - this page's phone surface. The 640+ toolbar row
  // below is the desktop surface; the phone trigger row is a genuinely
  // new affordance (the old inline panel was permanently open at every
  // width).
  const [sheetOpen, setSheetOpen] = useState(false)
  // Tier crossing: the sheet is phone-only and the toolbar row is
  // CSS-gated, so an up-crossing closes the sheet - an open flag
  // surviving the crossing would resurrect it on rotate-back. Loop-safe
  // by construction.
  const [prevMobile, setPrevMobile] = useState(isMobile)
  if (prevMobile !== isMobile) {
    setPrevMobile(isMobile)
    if (!isMobile) setSheetOpen(false)
  }

  // Stepper derivations on the EFFECTIVE range. This page's default range
  // is 'all' for now, so a fresh visit shows the label-only "All time"
  // stepper - coherent, not a defect; a default month arrives with the
  // page-defaults phase. The hop target computes from exactMonth (the range
  // on screen), never from "today"; createUpdateParams drops ?page on any
  // patch that does not set it.
  const exactMonth = isCalendarMonth(dateFrom, dateTo)
  const stepperLabel = stepperRangeLabel(dateFrom, dateTo, tTx('listFilters.presetAllTime'))
  const handleMonthShift = (delta: number) => {
    if (!exactMonth) return
    updateParams(shiftMonth(exactMonth, delta))
  }

  // Applied-filter chips: every active registry filter except date (the
  // stepper owns the date). Badge-clear parity and chips read the same
  // isActive; this page's non-date chip set is account alone. Typed i18next
  // only accepts a dynamic key alongside an explicit fallback, so the
  // fallback mirrors the key (every landed labelKey resolves; a missing one
  // would render its own key - immediately visible, never a silent blank).
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

  // One-shot defaults materialization (useStalePageReset shape: the URL
  // write goes through the closure-wrapped updateParams, never the raw
  // router setter - the shipped precedent for a no-event URL write from
  // an effect; a render-adjust must not write router state).
  // Fires only while the range latch is live: entering with both date
  // params absent writes the resolved default into the URL (replace, no
  // history entry). The write touches ONLY the defaultable param family
  // (from/to) plus createUpdateParams's automatic ?page drop - never the
  // account facet's own param. The consume adjust above then kills the
  // latch, so Clear / deep links never re-default within a session; a
  // fresh mount re-initializes the latch (accepted).
  useEffect(() => {
    if (!defaultsLatch.range) return
    updateParams({ from: defaultsLatch.range.from, to: defaultsLatch.range.to })
  }, [defaultsLatch, updateParams])

  const { data, isLoading } = useQuery({
    queryKey: ['transfers', page, pageSize, account, dateFrom, dateTo],
    queryFn: () =>
      transfersApi.getAll({
        page,
        page_size: pageSize,
        // v1 filter: ONE account id (either side of the transfer) - never an array.
        account_id: account ?? undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    // Previous page stays rendered while the next one loads - no skeleton
    // flash on page/filter changes (v5 placeholderData pattern).
    placeholderData: keepPreviousData,
  })

  // A stale ?page= beyond the (possibly shrunken) range resets to page 1 once
  // the response lands; the backend serves the clamped page meanwhile.
  useStalePageReset(page, data, updateParams)

  // The list page hosts the record panel at 1024+, so it reads :id itself
  // (both /transfers and /transfers/:id render this component there).
  // Garbage ids read as null.
  const params = useParams()
  const recordId = params.id && /^\d+$/.test(params.id) ? Number(params.id) : null
  // The create panel opens on the exact ?new=transfer value at 1024+
  // (garbage reads as unset). Precedence: the create panel wins the panel
  // slot over a selected record - every create-open write drops the
  // selection path, so the two states are never both visible.
  const createOpen = isDesktop && searchParams.get('new') === 'transfer'
  // Detail query keyed INSIDE the ['transfers'] family so every
  // family-wide invalidation refetches it - the same cache entry the
  // full-page record host and /new's repeat seed read (id-null key +
  // enabled gate, the useTransaction shape).
  const { data: record, isLoading: recordLoading, isError: recordError } = useQuery({
    queryKey: ['transfers', 'detail', recordId],
    queryFn: () => transfersApi.get(recordId!),
    enabled: recordId != null,
  })
  // Row-selected highlight: below 1024 this component never mounts with
  // an :id (the route element renders the record page there instead).
  const selectedId = recordId

  const [deleting, setDeleting] = useState<Transfer | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transfersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      toast.success(t('toast.deleted'))
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('toast.deleteFailed')))
      setDeleting(null)
    },
  })

  // Row tap/click opens the record. The tier fork lives INSIDE the handler
  // so the list stays mounted on every tier. At 1024+ a panel is "already
  // open" when this render sits on /transfers/:id - read at click time so
  // the FIRST open pushes (Back returns to the bare list) and every later
  // selection change replaces (Back never walks a click trail). The list
  // filters travel in the record URL so the list keeps filtering beside
  // the panel; below 1024 the push carries them in router state instead
  // (the full-page host's Back target reads it).
  const handleOpenRecord = (row: Transfer) => {
    if (isDesktop) {
      // Strip the create param: a row click while the create panel is open
      // must open the record, not carry ?new= into the record URL where
      // the create panel would keep winning the slot.
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      navigate(
        { pathname: `/transfers/${row.id}`, search: next.toString() },
        { replace: recordId != null },
      )
    } else {
      navigate(`/transfers/${row.id}`, { state: { search: searchParams.toString() } })
    }
  }
  // Panel close (X or Escape): replace keeps the closed record's URL out
  // of Back's path; every other param survives.
  const handleClosePanel = () =>
    navigate({ pathname: '/transfers', search: searchParams.toString() }, { replace: true })
  // Create panel close - the record close semantics on the list pathname.
  const closeCreatePanel = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    navigate(`/transfers?${next.toString()}`, { replace: true })
  }

  // Filter facets only - pagination does not change membership.
  const filterKey = `${account}|${dateFrom}|${dateTo}`
  // Keep-or-close reconcile for the open panel: when a filter change (or a
  // record error - deleted, foreign) proves the record no longer matches
  // the query, close the panel. Response arrival is not an event, so a
  // guarded effect is the only possible seam, and it navigates (a router
  // write, never component state).
  useEffect(() => {
    if (!(isDesktop && recordId != null)) return
    // A create URL wins the panel slot over the record: the reconcile
    // must not navigate away from the open create panel.
    if (createOpen) return
    if (recordLoading) return
    if (recordError || !record || !transferStillMatches(record, account, dateFrom, dateTo)) {
      navigate({ pathname: '/transfers', search: searchParams.toString() }, { replace: true })
    }
    // The effect reads the CURRENT filter values by design; filterKey is
    // the change signal, so the deps list is deliberately partial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, recordId, isDesktop, createOpen, record, recordLoading, recordError])

  // Clears URL params only - saved defaults (if any) are untouched: the
  // next fresh entry re-materializes them. Clearing is the user's explicit
  // all-time choice for THIS session (the latch is consumed).
  const clearFilters = () => updateParams(clearAllFilters(filterDefs))

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  // Single-choice editor options for the sheet: the unset row first, then
  // the accounts ("All accounts" clears the param).
  const accountEditorOptions: ChoiceOption<number>[] = [
    { value: NO_ACCOUNT, label: t('filters.allAccounts') },
    ...accountOptions,
  ]

  // Editor bodies for every filter-editor host (the phone sheet's editor
  // level and the toolbar's popovers): date gets the shared range editor,
  // account gets the single-choice editor (this page's account filter is
  // one id, never a list - a wire constraint). One wiring, two hosts.
  const renderFilterEditor = (def: FilterDef<TransfersFilterValues, TransfersFilterLookups>) => {
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
          <SingleChoiceEditor
            value={account ?? NO_ACCOUNT}
            onChange={(v) => updateParams({ account: v === NO_ACCOUNT ? null : v })}
            options={accountEditorOptions}
            aria-label={t('filters.filterByAccountAria')}
          />
        )
    }
  }
  const items = data?.items ?? []

  return (
    <>
      {/* Phone rows (below 640): the month stepper and the Filters entry,
          right-aligned to match where the sibling lists carry the trigger
          at row end. Their 640+ twins live inside the toolbar row below -
          a CSS-gated dual embed; the shared state is the URL. */}
      <div className="sm:hidden">
        <MonthStepper
          label={stepperLabel}
          onShift={exactMonth ? handleMonthShift : undefined}
          onOpenEditor={() => setSheetOpen(true)}
        />
      </div>
      <div className="sm:hidden mb-3 flex justify-end">
        <FiltersTrigger open={sheetOpen} count={activeCount} onOpen={() => setSheetOpen(true)} />
      </div>

      {/* 640+ toolbar: stepper (its label opens the date editor popover),
          applied chips (a chip opens its filter's editor), Add filter, and
          the Save view menu - no bookmark/search/sort members on this page
          (no bookmark kind exists for transfers, and the wire contract has
          no search or ordering params), so the Save view menu carries the
          save-default action alone. Hidden below 640, where the sheet
          above is the filter surface. */}
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
        saveView={{
          onSaveDefaults,
          saveDefaultsLabel: t('saveDefaults'),
          saveDefaultsPending,
          saveDefaultsPendingLabel: t('saveDefaultsPending'),
        }}
      />

      {/* The list and its pagination always ride the split's list slot;
          with no panel open the wrapper renders the list pixel-identically,
          so one stable tree spans the 1024 crossing with no remount. */}
      <SplitView
        list={
          <>
            {isLoading ? (
              <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}</div>
            ) : items.length === 0 ? (
              hasFilters ? (
                <p className="text-sm text-text-muted">{t('noMatch')}</p>
              ) : (
                <EmptyState
                  icon={<ArrowLeftRight size={48} strokeWidth={1.5} className="text-text-muted/30" />}
                  heading={t('emptyHeading')}
                  message={t('emptyMessage')}
                />
              )
            ) : (
              <div className="border border-border rounded-sm bg-surface divide-y divide-border">
                {items.map((row) => {
                  // Selected and unselected are mutually exclusive class
                  // sets; every row reserves the 2px left border
                  // (transparent when unselected) so selection never
                  // shifts content by 2px - the transactions table's
                  // selected-row idiom.
                  const selected = row.id === selectedId
                  return (
                    <div
                      key={row.id}
                      {...(isTouch
                        ? tappableProps(() => handleOpenRecord(row))
                        : { onClick: () => handleOpenRecord(row) })}
                      aria-current={selected ? 'true' : undefined}
                      className={`flex items-center justify-between px-4 py-2.5 text-sm group border-l-2 transition-colors cursor-pointer ${
                        selected
                          ? 'border-l-primary bg-surface-hover'
                          : 'border-l-transparent active:bg-surface-hover'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-text truncate">
                          {row.from_account_name} → {row.to_account_name}
                          {row.description && <span className="text-text-muted"> · {row.description}</span>}
                        </div>
                        <div className="text-[10px] font-mono text-text-muted">{row.date}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 pl-3">
                        {/* Cross-currency: second small line instead of one long string
                            that would overflow 375px. */}
                        <span className="font-mono text-text text-right">
                          <span className="whitespace-nowrap">{formatAmount(row.from_amount)} {row.from_currency_code}</span>
                          {row.from_currency_code !== row.to_currency_code && (
                            <span className="block text-[10px] text-text-muted whitespace-nowrap">
                              → {formatAmount(row.to_amount)} {row.to_currency_code}
                            </span>
                          )}
                        </span>
                        {/* Hover reveals are pointer-fine only - on touch the
                            row itself opens the record (repeat and delete
                            live in the record). The wrapper stops the click
                            before it bubbles into the row's open handler:
                            the action must run alone, never double-fire. */}
                        {canWrite && !isTouch && (
                          <div
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button type="button" onClick={() => navigate(`/new?type=transfer&copy_transfer=${row.id}`)} title={t('row.repeat')} aria-label={t('row.repeatAria')} className="text-text-muted hover:text-text p-1"><Repeat size={13} /></button>
                            <button type="button" onClick={() => setDeleting(row)} title={t('row.delete')} aria-label={t('row.deleteAria')} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
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
          </>
        }
        panel={createOpen ? (
          <TransferCreatePanel onClose={closeCreatePanel} />
        ) : isDesktop && recordId != null ? (
          // The record renders its own footer internally (Repeat and
          // Delete), so the panel shell passes no footer. The title falls
          // back to the generic record label only for the loading window;
          // once loaded the From -> To line is the title.
          <DetailPanel title={record ? `${record.from_account_name} → ${record.to_account_name}` : t('record.title')} onClose={handleClosePanel}>
            {recordLoading ? (
              // Hold, never flash: fields would flash unstyled while the
              // row loads. A record that errors out (deleted, foreign)
              // closes via the reconcile above.
              <div className="space-y-3 pt-2" aria-hidden="true">
                <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
                <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
              </div>
            ) : record ? (
              <TransferRecord
                transfer={record}
                canWrite={canWrite}
                onRepeat={(transfer) => navigate(`/new?type=transfer&copy_transfer=${transfer.id}`)}
                onDelete={(transfer) => setDeleting(transfer)}
              />
            ) : null}
          </DetailPanel>
        ) : null}
      />

      {/* Phone filter sheet: date + account only (this page's wire contract
          has no search or ordering params, and no bookmark kind), so no sort
          row and no bookmark action. */}
      {isMobile && (
        <FilterSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          filters={filterDefs}
          values={filterValues}
          lookups={filterLookups}
          filterLabel={filterLabel}
          updateParams={updateParams}
          renderEditor={renderFilterEditor}
          onSaveDefaults={onSaveDefaults}
          saveDefaultsPending={saveDefaultsPending}
          saveDefaultsLabel={t('saveDefaults')}
          saveDefaultsPendingLabel={t('saveDefaultsPending')}
          total={data?.total ?? 0}
          footerNoun={t('sheetNoun', { count: data?.total ?? 0 })}
        />
      )}
      <ConfirmDialog
        isOpen={!!deleting}
        title={t('confirmDelete.title')}
        message={t('confirmDelete.message', {
          from: deleting?.from_account_name ?? '',
          to: deleting?.to_account_name ?? '',
        })}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}

/** In-flow create host for the split's panel slot (the ?new= URL is the
 *  open state; the page passes the close write). The /new page's transfer
 *  flavor in a panel: shared amount/date rows above the fields component,
 *  the two-action footer, and the unsaved-changes confirm on close (the
 *  /new flow's protection). No copy mode - Repeat from a row or the record
 *  always navigates /new. */
function TransferCreatePanel({ onClose }: { onClose: () => void }) {
  const { t: tTransfers } = useTranslation('transfers')
  // Footer/confirm/date-label keys live in the transactions namespace -
  // the /new page's own keys (one label per concept; the aliased-t
  // cross-namespace pattern this page already uses for tTx).
  const { t } = useTranslation('transactions')
  const isTouch = useIsTouch()

  // Lifted amount/date rows, the /new shared seam: the hook's internal
  // state tracks the lifted values continuously through the override.
  const [sharedAmount, setSharedAmount] = useState('')
  const [sharedDate, setSharedDate] = useState(new Date().toISOString().slice(0, 10))
  const shared = { amount: sharedAmount, onAmountChange: setSharedAmount, date: sharedDate, onDateChange: setSharedDate }
  // validationToasts: false - field errors render inline; save toasts stay.
  const form = useTransferForm({ open: true, validationToasts: false, shared })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [showAllErrors, setShowAllErrors] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const [amountTouched, setAmountTouched] = useState(false)
  const [savingAction, setSavingAction] = useState<'save' | 'another' | null>(null)
  const amountRef = useRef<HTMLInputElement | null>(null)

  // An accidental Escape/X over typed text must not lose data the /new
  // flow protects - the same unsaved-changes guard as the create page.
  const dirtyClose = () => (form.isDirty ? setConfirmOpen(true) : onClose())

  // After a failed submit, show every error and focus the first invalid
  // field (the create page's transfer branch): the shared amount row is
  // host-owned (focus it directly), the rest live inside the fields
  // component (bump its tick).
  const reportFailedSubmit = () => {
    setShowAllErrors(true)
    if (form.errors.fromAmount && !form.errors.from && !form.errors.to) {
      amountRef.current?.focus()
    } else if (form.errors.from || form.errors.to || form.errors.toAmount) {
      setFocusTick((n) => n + 1)
    }
  }

  const handleSave = async () => {
    setSavingAction('save')
    const { ok } = await form.submit()
    setSavingAction(null)
    // Close only on success: validation failures keep the panel open
    // with its inline errors.
    if (ok) onClose()
    else reportFailedSubmit()
  }

  const handleSaveAndAddAnother = async () => {
    setSavingAction('another')
    const { ok } = await form.submit()
    setSavingAction(null)
    if (ok) {
      form.resetForAnother()
      // Fresh form, fresh error timing; refocus the amount (the fields
      // stay mounted, so no mount autofocus refires).
      setShowAllErrors(false)
      setAmountTouched(false)
      amountRef.current?.focus()
    } else reportFailedSubmit()
  }

  // Hoisted labels (aliased-t calls must not render inline) - the create
  // page's transfer branch.
  const amountSentLabel = tTransfers('fields.amountSent', { code: form.fromAccount?.currency_code ?? '' })
  const amountLabel = form.crossCurrency ? amountSentLabel : tTransfers('fields.amount')
  const panelTitle = tTransfers('actions.newTransfer')
  const amountError = form.errors.fromAmount !== undefined && (amountTouched || showAllErrors) ? form.errors.fromAmount : undefined
  const savePending = savingAction !== null || form.isSaving

  return (
    <>
      <DetailPanel
        title={panelTitle}
        onClose={dirtyClose}
        footer={
          // Wrap, never stack (a ~366px footer; long locales must not
          // overflow) and never a hidden action: the /new two-action
          // footer semantics, panel-adapted. Primary action is
          // type="button" so it can never submit a parent form.
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={handleSaveAndAddAnother} disabled={savePending} className={secondaryButtonClass}>
              {savingAction === 'another' ? t('form.saving') : t('form.saveAndAddAnother')}
            </button>
            <button type="button" onClick={handleSave} disabled={savePending} className={primaryButtonClass}>
              {savingAction === 'save' ? t('form.saving') : t('form.saveTransfer')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <AmountField
            id="transfer-panel-amount"
            label={amountLabel}
            value={sharedAmount}
            onChange={setSharedAmount}
            signPrefix=""
            error={amountError}
            inputRef={amountRef}
            autoFocus={!isTouch}
            onBlur={() => setAmountTouched(true)}
          />
          <div>
            <label className={labelClass}>{t('form.dateLabel')}</label>
            <DateQuickPick value={sharedDate} onChange={setSharedDate} />
          </div>
          <TransferFormFields form={form} showAllErrors={showAllErrors} focusInvalidTick={focusTick} />
        </div>
      </DetailPanel>
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
