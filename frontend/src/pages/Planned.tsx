import { useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Ban, Copy, Plus, Pencil, Trash2, CheckCircle } from 'lucide-react'
import { plannedTransactionsApi } from '../api/client'
import type { PlannedTransaction } from '../types'
import { useAccounts, useEnabledCurrencies, useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
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
import ListFilterFields from '../components/common/ListFilterFields'
import { FiltersToggle, FilterPanel, FilterField } from '../components/common/FilterBar'
import { primaryButtonClass } from '../components/common/formStyles'

const STATUS_STYLE: Record<string, string> = {
  pending: 'text-warning border-warning/40',
  done: 'text-positive border-positive/40',
  cancelled: 'text-text-muted border-border',
}

type StatusFilter = 'all' | 'pending' | 'done' | 'cancelled'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function Planned() {
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const { data: accounts = [] } = useAccounts(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  const isTouch = useIsTouch()

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
  const search = searchParams.get('search') ?? ''
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

  const [pageSize, setPageSize] = useState(getStoredPageSize)

  const updateParams = createUpdateParams(setSearchParams)

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
    queryKey: ['planned', statusFilter, page, pageSize, search, accountFilter.join(','), currencyFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo],
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
      }),
    // Previous page stays rendered while the next one loads — no skeleton
    // flash on page/filter changes (v5 placeholderData pattern).
    placeholderData: keepPreviousData,
  })
  const items = data?.items ?? []

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  const executeMutation = useMutation({
    mutationFn: (p: PlannedTransaction) => plannedTransactionsApi.execute(p.id, new Date().toISOString().slice(0, 10)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success('Executed — transaction created')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to execute')),
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
      toast.success('Plan cancelled')
      setCancelling(null)
    },
    onError: (error) => { toast.error(getApiErrorMessage(error, 'Failed to cancel')); setCancelling(null) },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => plannedTransactionsApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['planned'] }); toast.success('Deleted'); setDeleting(null) },
    onError: (error) => { toast.error(getApiErrorMessage(error, 'Failed to delete')); setDeleting(null) },
  })

  return (
    <div className="p-6 max-sm:p-0 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">Planned</h1>
        {/* Hidden on mobile: the FAB quick-add has Planned (plan decision 6). */}
        {canWrite && (
          <button onClick={openNew} className={`${primaryButtonClass} max-sm:hidden`}>
            <Plus size={13} className="inline mr-1" /> New planned
          </button>
        )}
      </div>

      <div className="mb-3">
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => updateParams({ status: v === 'all' ? null : v })}
          options={STATUS_OPTIONS}
          aria-label="Filter by status"
        />
      </div>

      <div className="flex gap-2 mb-3">
        <SearchInput
          value={search}
          onChange={(next) => updateParams({ search: next || null })}
          placeholder="Search names…"
          aria-label="Search planned transactions"
          className="flex-1 max-w-sm max-sm:max-w-none"
        />
        <FiltersToggle open={filtersOpen} count={activeFilterCount} onToggle={() => setFiltersOpen((v) => !v)} aria-controls={filterPanelId} />
      </div>

      {filtersOpen && (
        <FilterPanel id={filterPanelId} onClear={activeFilterCount > 0 ? clearFilters : null}>
          {accounts.length > 1 && (
            <FilterField label="Account">
              <MultiSelect values={accountFilter} onChange={(v) => updateParams({ account: v })} options={accountOptions} placeholder="All accounts" aria-label="Filter by account" />
            </FilterField>
          )}
          {multiCurrency && (
            <FilterField label="Currency">
              <MultiSelect
                values={currencyFilter}
                onChange={(v) => updateParams({ currency: v })}
                options={currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))}
                placeholder="All currencies"
                aria-label="Filter by currency"
              />
            </FilterField>
          )}
          <ListFilterFields dateLabel="Planned date" />
        </FilterPanel>
      )}

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">
          {search || activeFilterCount > 0
            ? 'No planned transactions match your search or filters.'
            : statusFilter === 'all'
              ? 'No planned transactions.'
              : `No ${statusFilter} planned transactions.`}
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
                  <span className={`text-[9px] font-mono uppercase tracking-wider border rounded-sm px-1 ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                </div>
                <div className="text-[10px] font-mono text-text-muted">
                  {p.planned_date}{p.category?.name ? ` · ${p.category.name}` : ''} · {p.account_name ?? 'No account'}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                <span className="font-mono text-text whitespace-nowrap">{formatAmount(p.amount)} {multiCurrency ? p.currency_code : ''}</span>
                {/* Hover reveals are pointer-fine only — on touch the row tap
                    opens the edit modal instead. */}
                {canWrite && !isTouch && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.status === 'pending' && (
                      <button onClick={() => executeMutation.mutate(p)} className="text-text-muted hover:text-positive p-1" title="Execute"><CheckCircle size={13} /></button>
                    )}
                    {p.status === 'pending' && (
                      <button onClick={() => setCancelling(p)} className="text-text-muted hover:text-warning p-1" title="Cancel plan"><Ban size={13} /></button>
                    )}
                    <button onClick={() => openEdit(p)} title="Edit" className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                    <button onClick={() => openCopy(p)} title="Copy" className="text-text-muted hover:text-text p-1"><Copy size={13} /></button>
                    <button onClick={() => setDeleting(p)} title="Delete" className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {data && data.total_pages > 1 && (
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
        title="Delete planned transaction"
        message={`Delete "${deleting?.name}"?`}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        isOpen={!!cancelling}
        title="Cancel plan"
        message={`Mark "${cancelling?.name}" as cancelled? The row stays in the list but can no longer be executed.`}
        confirmLabel="Cancel plan"
        isPending={cancelMutation.isPending}
        onConfirm={() => cancelling && cancelMutation.mutate(cancelling)}
        onCancel={() => setCancelling(null)}
      />
    </div>
  )
}
