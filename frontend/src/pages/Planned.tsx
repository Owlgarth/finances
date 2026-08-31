import { useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Ban, Copy, Download, Plus, Pencil, Trash2, CheckCircle } from 'lucide-react'
import { plannedTransactionsApi, type PlannedTransactionOrdering } from '../api/client'
import type { PlannedTransaction } from '../types'
import { useAccounts, useEnabledCurrencies, useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { triggerBrowserDownload } from '../utils/attachments'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { amountParam, createUpdateParams, intListParam, intParam } from '../utils/params'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import PlannedFormModal from '../components/modals/transactions/PlannedFormModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
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

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PlannedTransaction | null>(null)
  const [copySource, setCopySource] = useState<PlannedTransaction | null>(null)
  const [deleting, setDeleting] = useState<PlannedTransaction | null>(null)
  // Cancel confirms like delete: there is no un-cancel in the UI, so a stray
  // click on the hover-revealed Ban icon must not fire the mutation directly.
  const [cancelling, setCancelling] = useState<PlannedTransaction | null>(null)

  const openNew = () => { setEditing(null); setCopySource(null); setFormOpen(true) }
  const openEdit = (p: PlannedTransaction) => { setEditing(p); setCopySource(null); setFormOpen(true) }
  // Copy = new-planned form prefilled from p, date reset to today. Also
  // reachable from inside the edit modal, which then morphs into copy mode.
  const openCopy = (p: PlannedTransaction) => { setEditing(null); setCopySource(p); setFormOpen(true) }

  // Filter state lives in the URL: shareable, bookmarkable, back-button friendly.
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStatus = searchParams.get('status')
  const statusFilter: StatusFilter = STATUS_OPTIONS.some((o) => o.value === rawStatus)
    ? (rawStatus as StatusFilter)
    : 'all'
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
  const dateFrom = searchParams.get('from') ?? ''
  const dateTo = searchParams.get('to') ?? ''
  const page = intParam(searchParams, 'page') ?? 1
  // Garbage ?ordering= values read as unset (status-filter idiom): the Select
  // shows the default placeholder and the request sends nothing.
  const rawOrdering = searchParams.get('ordering')
  const ordering = SORT_OPTIONS.some((o) => o.value === rawOrdering) ? (rawOrdering as PlannedTransactionOrdering) : null

  const [pageSize, setPageSize] = useState(getStoredPageSize)
  const [isExporting, setIsExporting] = useState(false)

  const updateParams = createUpdateParams(setSearchParams)

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
    const toastId = toast.loading(t('preparingExport'))
    setIsExporting(true)
    try {
      const blob = await plannedTransactionsApi.exportView({
        status: statusFilter === 'all' ? undefined : statusFilter,
        start_date: dateFrom || undefined,
        end_date: dateTo || undefined,
      })
      const url = URL.createObjectURL(blob)
      triggerBrowserDownload(url, `planned_${dateFrom || 'all'}_${dateTo || 'all'}.json`)
      URL.revokeObjectURL(url)
      toast.success(t('exportComplete'), { id: toastId })
    } catch {
      toast.error(t('exportFailed'), { id: toastId })
    } finally {
      setIsExporting(false)
    }
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

  // Deep links with filters land with the panel already open.
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0)
  const filterPanelId = useId()

  const clearFilters = () =>
    updateParams({ account: null, budget: null, category: null, currency: null, amount_min: null, amount_max: null, from: null, to: null })

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
  const items = data?.items ?? []

  // Keyed INSIDE the ['planned'] family so every existing invalidation of that
  // prefix (form modal, execute, cancel, delete) refetches the strip too.
  // Same dependency values as the list query minus page/pageSize/ordering.
  // No currency_code here: the planned-totals route accepts none of the
  // currency params the list route does.
  const { data: totalsData, isLoading: totalsIsLoading } = useQuery({
    queryKey: ['planned', 'totals', statusFilter, search, accountFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo],
    queryFn: () =>
      plannedTransactionsApi.getTotals({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: search || undefined,
        account_id: accountFilter.length ? accountFilter : undefined,
        budget_id: budgetFilter.length ? budgetFilter : undefined,
        category_id: categoryFilter.length ? categoryFilter : undefined,
        amount_gte: amountParam(amountMin),
        amount_lte: amountParam(amountMax),
        start_date: dateFrom || undefined,
        end_date: dateTo || undefined,
        group_by: 'currency',
      }),
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
          {/* Hidden on mobile: the FAB quick-add has Planned (plan decision 6). */}
          {canWrite && (
            <button onClick={openNew} className={`${primaryButtonClass} max-sm:hidden`}>
              <Plus size={13} className="inline mr-1" /> {t('newPlanned')}
            </button>
          )}
        </div>
      </div>

      <div className="mb-3">
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => updateParams({ status: v === 'all' ? null : v })}
          options={statusOptions}
          aria-label={t('statusAria')}
        />
      </div>

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

      {filtersOpen && (
        <FilterPanel id={filterPanelId} onClear={activeFilterCount > 0 ? clearFilters : null}>
          {accounts.length > 1 && (
            <FilterField label={t('filters.account')}>
              <MultiSelect values={accountFilter} onChange={(v) => updateParams({ account: v })} options={accountOptions} placeholder={t('filters.allAccounts')} aria-label={t('filters.byAccountAria')} />
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
              />
            </FilterField>
          )}
          <ListFilterFields dateLabel={t('filters.plannedDate')} />
        </FilterPanel>
      )}

      {/* Hidden while the list itself is unknown/empty: no rows, no totals. */}
      {(data?.total ?? 0) > 0 && (
        <ListTotalsStrip
          caption={t('totals.caption', { count: data?.total ?? 0 })}
          items={totalsData?.totals ?? []}
          tone={() => 'neutral'}
          isLoading={totalsIsLoading}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">
          {search || activeFilterCount > 0
            ? t('emptyFiltered')
            : statusFilter === 'all'
              ? t('empty')
              : t('emptyWithStatus', { status: statusLabel(statusFilter) })}
        </p>
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {items.map((p) => (
            <div
              key={p.id}
              {...(isTouch && canWrite ? tappableProps(() => openEdit(p)) : {})}
              className={`flex items-center justify-between px-4 py-3 text-sm group ${
                isTouch && canWrite ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-text truncate">{p.name}</span>
                  <span className={`text-[9px] font-mono uppercase tracking-wider border rounded-sm px-1 ${STATUS_STYLE[p.status]}`}>{statusLabel(p.status)}</span>
                </div>
                <div className="text-[10px] font-mono text-text-muted">
                  {p.planned_date}{p.category?.name ? ` · ${p.category.name}` : ''} · {p.account_name ?? t('noAccount')}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                <span className="font-mono text-text whitespace-nowrap">{formatAmount(p.amount)} {multiCurrency ? p.currency_code : ''}</span>
                {/* Hover reveals are pointer-fine only — on touch the row tap
                    opens the edit modal instead. */}
                {canWrite && !isTouch && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.status === 'pending' && (
                      <button onClick={() => executeMutation.mutate(p)} className="text-text-muted hover:text-positive p-1" title={t('rowActions.execute')}><CheckCircle size={13} /></button>
                    )}
                    {p.status === 'pending' && (
                      <button onClick={() => setCancelling(p)} className="text-text-muted hover:text-warning p-1" title={t('rowActions.cancelPlan')}><Ban size={13} /></button>
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
    </div>
  )
}
