import { useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, Plus, Pencil, Trash2 } from 'lucide-react'
import { transactionsApi } from '../api/client'
import type { Transaction } from '../types'
import { useAccounts, useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { amountParam, createUpdateParams, intListParam, intParam } from '../utils/params'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import TransactionFormModal from '../components/modals/transactions/TransactionFormModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Pagination from '../components/common/Pagination'
import MultiSelect from '../components/common/MultiSelect'
import SearchInput from '../components/common/SearchInput'
import ListFilterFields from '../components/common/ListFilterFields'
import { FiltersToggle, FilterPanel, FilterField } from '../components/common/FilterBar'
import { primaryButtonClass } from '../components/common/formStyles'

const TYPE_STYLE: Record<string, string> = {
  income: 'text-positive',
  expense: 'text-negative',
  adjustment: 'text-warning',
}

const TYPE_OPTIONS = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'adjustment', label: 'Adjustment' },
]

export default function Transactions() {
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const { data: accounts = [] } = useAccounts(false)

  // Filter state lives in the URL: shareable, bookmarkable, back-button friendly.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const accountFilter = intListParam(searchParams, 'account')
  const typeFilter = (searchParams.get('type') ?? '')
    .split(',')
    .filter((v) => TYPE_OPTIONS.some((o) => o.value === v))
  const budgetFilter = intListParam(searchParams, 'budget')
  const categoryFilter = intListParam(searchParams, 'category')
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
    typeFilter.length > 0,
    budgetFilter.length > 0,
    categoryFilter.length > 0,
    Boolean(amountMin || amountMax),
    Boolean(dateFrom || dateTo),
  ].filter(Boolean).length

  // Deep links with filters land with the panel already open.
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0)
  const filterPanelId = useId()

  const clearFilters = () =>
    updateParams({ account: null, type: null, budget: null, category: null, amount_min: null, amount_max: null, from: null, to: null })

  const isTouch = useIsTouch()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [copySource, setCopySource] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, pageSize, search, accountFilter.join(','), typeFilter.join(','), budgetFilter.join(','), categoryFilter.join(','), amountMin, amountMax, dateFrom, dateTo],
    queryFn: () =>
      transactionsApi.getAll({
        page,
        page_size: pageSize,
        search: search || undefined,
        account_id: accountFilter.length ? accountFilter : undefined,
        transaction_type: typeFilter.length ? typeFilter : undefined,
        budget_id: budgetFilter.length ? budgetFilter : undefined,
        category_id: categoryFilter.length ? categoryFilter : undefined,
        amount_gte: amountParam(amountMin),
        amount_lte: amountParam(amountMax),
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    // Previous page stays rendered while the next one loads — no skeleton
    // flash on page/filter changes (v5 placeholderData pattern).
    placeholderData: keepPreviousData,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success('Transaction deleted')
      setDeleting(null)
    },
    onError: (error) => { toast.error(getApiErrorMessage(error, 'Failed to delete')); setDeleting(null) },
  })

  const openNew = () => { setEditing(null); setCopySource(null); setFormOpen(true) }
  const openEdit = (t: Transaction) => { setEditing(t); setCopySource(null); setFormOpen(true) }
  // Copy = new-transaction form prefilled from t, date reset to today. Also
  // reachable from inside the edit modal, which then morphs into copy mode.
  const openCopy = (t: Transaction) => { setEditing(null); setCopySource(t); setFormOpen(true) }

  const showAccountColumn = accounts.length > 1
  const items = data?.items ?? []

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">Transactions</h1>
        {/* Hidden on mobile: the FAB quick-add owns creation there (plan decision 6). */}
        {canWrite && (
          <div className="flex items-center gap-2 max-sm:hidden">
            <button onClick={openNew} className={primaryButtonClass}>
              <Plus size={13} className="inline mr-1" /> New transaction
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        <SearchInput
          value={search}
          onChange={(next) => updateParams({ search: next || null })}
          placeholder="Search descriptions…"
          aria-label="Search transactions"
          className="flex-1 max-w-sm max-sm:max-w-none"
        />
        <FiltersToggle open={filtersOpen} count={activeFilterCount} onToggle={() => setFiltersOpen((v) => !v)} aria-controls={filterPanelId} />
      </div>

      {filtersOpen && (
        <FilterPanel id={filterPanelId} onClear={activeFilterCount > 0 ? clearFilters : null}>
          {showAccountColumn && (
            <FilterField label="Account">
              <MultiSelect values={accountFilter} onChange={(v) => updateParams({ account: v })} options={accountOptions} placeholder="All accounts" aria-label="Filter by account" />
            </FilterField>
          )}
          <FilterField label="Type">
            <MultiSelect values={typeFilter} onChange={(v) => updateParams({ type: v })} options={TYPE_OPTIONS} placeholder="All types" aria-label="Filter by type" />
          </FilterField>
          <ListFilterFields />
        </FilterPanel>
      )}

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">
          {search || activeFilterCount > 0 ? 'No transactions match your search or filters.' : 'No transactions yet.'}
        </p>
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {items.map((t) => (
            <div
              key={t.id}
              {...(isTouch && canWrite ? tappableProps(() => openEdit(t)) : {})}
              className={`flex items-center justify-between px-4 py-2.5 text-sm group ${
                isTouch && canWrite ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-text truncate">{t.description}</span>
                  {t.type === 'adjustment' && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-warning border border-warning/40 rounded-sm px-1">Adj</span>
                  )}
                </div>
                {/* Single truncating string — a flex row here would wrap on long
                    category/account names and grow the row past spec height. */}
                <div className="text-[10px] font-mono text-text-muted truncate">
                  {[t.date, t.category_name, showAccountColumn ? t.account_name : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                <div className="text-right">
                  <span className={`font-mono whitespace-nowrap ${TYPE_STYLE[t.type]}`}>
                    {t.type === 'expense' ? '−' : t.type === 'income' ? '+' : ''}
                    {formatAmount(t.amount)} {multiCurrency ? t.currency_code : ''}
                  </span>
                  {t.original_amount && t.original_currency_code && (
                    <div className="text-[10px] font-mono text-text-muted">
                      {formatAmount(t.original_amount)} {t.original_currency_code}
                    </div>
                  )}
                </div>
                {/* Hover reveals are pointer-fine only — on touch they'd be
                    invisible tap targets; the row tap opens the sheet instead. */}
                {canWrite && !isTouch && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(t)} title="Edit" className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                    <button onClick={() => openCopy(t)} title="Copy" className="text-text-muted hover:text-text p-1"><Copy size={13} /></button>
                    <button onClick={() => setDeleting(t)} title="Delete" className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.total_pages > 1 && (
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
        title="Delete transaction"
        message={`Delete "${deleting?.description}"?`}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
