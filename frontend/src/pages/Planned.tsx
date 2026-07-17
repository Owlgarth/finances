import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, CheckCircle } from 'lucide-react'
import { plannedTransactionsApi } from '../api/client'
import type { PlannedTransaction } from '../types'
import { useAccounts, useBudgets, useMultiCurrency, useWorkspaceCategories } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import PlannedFormModal from '../components/modals/transactions/PlannedFormModal'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Pagination from '../components/common/Pagination'
import SegmentedControl from '../components/common/SegmentedControl'
import MultiSelect from '../components/common/MultiSelect'
import SearchInput from '../components/common/SearchInput'
import AmountInput from '../components/common/AmountInput'
import { FiltersToggle, FilterPanel, FilterField } from '../components/common/FilterBar'
import { inputClass, primaryButtonClass } from '../components/common/formStyles'

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

/** Positive int URL param or null (garbage and <=0 read as unset). */
function intParam(params: URLSearchParams, key: string): number | null {
  const n = Number(params.get(key))
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Comma-separated int list URL param (garbage entries dropped). */
function intListParam(params: URLSearchParams, key: string): number[] {
  const raw = params.get(key)
  if (!raw) return []
  return raw
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
}

/** Amount param → number for the API, or undefined when unset/garbage. */
function amountParam(raw: string): number | undefined {
  if (raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export default function Planned() {
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: categories = [] } = useWorkspaceCategories(false)

  const isTouch = useIsTouch()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PlannedTransaction | null>(null)
  const [deleting, setDeleting] = useState<PlannedTransaction | null>(null)
  // Touch replacement for the hover-revealed row actions (plan decision 7).
  const [actionTarget, setActionTarget] = useState<PlannedTransaction | null>(null)

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
  const amountMin = searchParams.get('amount_min') ?? ''
  const amountMax = searchParams.get('amount_max') ?? ''
  const dateFrom = searchParams.get('from') ?? ''
  const dateTo = searchParams.get('to') ?? ''
  const page = intParam(searchParams, 'page') ?? 1

  const [pageSize, setPageSize] = useState(25)

  const updateParams = (patch: Record<string, string | number | (string | number)[] | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        // Any filter change invalidates the current page number.
        if (!('page' in patch)) next.delete('page')
        for (const [key, value] of Object.entries(patch)) {
          const str = Array.isArray(value) ? value.join(',') : value
          if (str === null || str === '') next.delete(key)
          else next.set(key, String(str))
        }
        return next
      },
      { replace: true },
    )
  }

  // Each facet counts once, however many values it holds.
  const activeFilterCount = [
    accountFilter.length > 0,
    budgetFilter.length > 0,
    categoryFilter.length > 0,
    Boolean(amountMin || amountMax),
    Boolean(dateFrom || dateTo),
  ].filter(Boolean).length

  // Deep links with filters land with the panel already open.
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0)

  const clearFilters = () =>
    updateParams({ account: null, budget: null, category: null, amount_min: null, amount_max: null, from: null, to: null })

  const { data, isLoading } = useQuery({
    queryKey: ['planned', statusFilter, page, pageSize, search, accountFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo],
    queryFn: () =>
      plannedTransactionsApi.getAll({
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        page_size: pageSize,
        search: search || undefined,
        account_id: accountFilter.length ? accountFilter : undefined,
        budget_id: budgetFilter.length ? budgetFilter : undefined,
        category_id: categoryFilter.length ? categoryFilter : undefined,
        amount_gte: amountParam(amountMin),
        amount_lte: amountParam(amountMax),
        start_date: dateFrom || undefined,
        end_date: dateTo || undefined,
      }),
  })
  const items = data?.items ?? []

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const budgetNames = new Map(budgets.map((b) => [b.id, b.name]))
  // Budget filter narrows the category picker; unless it pins categories to a
  // single budget, cross-budget names disambiguate with their budget's name.
  const budgetSet = new Set(budgetFilter)
  const showBudgetSuffix = budgets.length > 1 && budgetFilter.length !== 1
  const categoryOptions = categories
    .filter((c) => budgetSet.size === 0 || budgetSet.has(c.budget_id))
    .map((c) => ({
      value: c.id,
      label: showBudgetSuffix ? `${c.name} · ${budgetNames.get(c.budget_id) ?? ''}` : c.name,
    }))

  const setBudgetFilter = (values: number[]) => {
    // Keep only categories that still belong to the selected budgets.
    const nextBudgetSet = new Set(values)
    const kept = categoryFilter.filter((id) => {
      const category = categories.find((c) => c.id === id)
      return category !== undefined && (nextBudgetSet.size === 0 || nextBudgetSet.has(category.budget_id))
    })
    updateParams({ budget: values, category: kept })
  }

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
          <button onClick={() => { setEditing(null); setFormOpen(true) }} className={`${primaryButtonClass} max-sm:hidden`}>
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
        <FiltersToggle open={filtersOpen} count={activeFilterCount} onToggle={() => setFiltersOpen((v) => !v)} />
      </div>

      {filtersOpen && (
        <FilterPanel onClear={activeFilterCount > 0 ? clearFilters : null}>
          {accounts.length > 1 && (
            <FilterField label="Account">
              <MultiSelect values={accountFilter} onChange={(v) => updateParams({ account: v })} options={accountOptions} placeholder="All accounts" aria-label="Filter by account" />
            </FilterField>
          )}
          {budgets.length > 0 && (
            <FilterField label="Budget">
              <MultiSelect values={budgetFilter} onChange={setBudgetFilter} options={budgetOptions} placeholder="All budgets" aria-label="Filter by budget" />
            </FilterField>
          )}
          {categories.length > 0 && (
            <FilterField label="Category">
              <MultiSelect values={categoryFilter} onChange={(v) => updateParams({ category: v })} options={categoryOptions} placeholder="All categories" aria-label="Filter by category" searchable />
            </FilterField>
          )}
          <FilterField label="Amount">
            <div className="flex items-center gap-1.5">
              <AmountInput value={amountMin} onCommit={(v) => updateParams({ amount_min: v || null })} placeholder="Min" aria-label="Minimum amount" />
              <span className="text-text-muted text-xs">–</span>
              <AmountInput value={amountMax} onCommit={(v) => updateParams({ amount_max: v || null })} placeholder="Max" aria-label="Maximum amount" />
            </div>
          </FilterField>
          <FilterField label="Planned date" className="col-span-2">
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} onChange={(e) => updateParams({ from: e.target.value || null })} aria-label="From date" className={`${inputClass} max-sm:min-h-[44px]`} />
              <span className="text-text-muted text-xs">–</span>
              <input type="date" value={dateTo} onChange={(e) => updateParams({ to: e.target.value || null })} aria-label="To date" className={`${inputClass} max-sm:min-h-[44px]`} />
            </div>
          </FilterField>
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
              {...(isTouch && canWrite ? tappableProps(() => setActionTarget(p)) : {})}
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
                  {p.planned_date}{p.category?.name ? ` · ${p.category.name}` : ''} · {p.account_name}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                <span className="font-mono text-text whitespace-nowrap">{formatAmount(p.amount)} {multiCurrency ? p.currency_code : ''}</span>
                {/* Hover reveals are pointer-fine only — on touch the row tap
                    opens the action sheet instead. */}
                {canWrite && !isTouch && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {p.status === 'pending' && (
                      <button onClick={() => executeMutation.mutate(p)} className="text-text-muted hover:text-positive p-1" title="Execute"><CheckCircle size={13} /></button>
                    )}
                    <button onClick={() => { setEditing(p); setFormOpen(true) }} className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                    <button onClick={() => setDeleting(p)} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
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
              onPageSizeChange={(s) => { setPageSize(s); updateParams({ page: null }) }}
            />
          )}
        </div>
      )}

      <ActionSheet
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.name}
        actions={[
          ...(actionTarget?.status === 'pending'
            ? [{ label: 'Execute now', icon: CheckCircle, onSelect: () => actionTarget && executeMutation.mutate(actionTarget) }]
            : []),
          { label: 'Edit', icon: Pencil, onSelect: () => { if (actionTarget) { setEditing(actionTarget); setFormOpen(true) } } },
          { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => actionTarget && setDeleting(actionTarget) },
        ]}
      />
      <PlannedFormModal open={formOpen} onClose={() => setFormOpen(false)} planned={editing} />
      <ConfirmDialog
        isOpen={!!deleting}
        title="Delete planned transaction"
        message={`Delete "${deleting?.name}"?`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
