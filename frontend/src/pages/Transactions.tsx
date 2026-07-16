import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, ScanLine } from 'lucide-react'
import { transactionsApi } from '../api/client'
import type { Transaction } from '../types'
import { useAccounts, useBudgets, useMultiCurrency, useExtractionEnabled, useWorkspaceCategories } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import TransactionFormModal from '../components/modals/transactions/TransactionFormModal'
import NewFromReceiptModal from '../components/modals/transactions/NewFromReceiptModal'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Pagination from '../components/common/Pagination'
import Select from '../components/common/Select'
import SearchInput from '../components/common/SearchInput'
import AmountInput from '../components/common/AmountInput'
import { FiltersToggle, FilterPanel, FilterField } from '../components/common/FilterBar'
import { inputClass, primaryButtonClass } from '../components/common/formStyles'

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

/** Positive int URL param or null (garbage and <=0 read as unset). */
function intParam(params: URLSearchParams, key: string): number | null {
  const n = Number(params.get(key))
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Amount param → number for the API, or undefined when unset/garbage. */
function amountParam(raw: string): number | undefined {
  if (raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export default function Transactions() {
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const extractionEnabled = useExtractionEnabled()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: categories = [] } = useWorkspaceCategories(false)

  // Filter state lives in the URL: shareable, bookmarkable, back-button friendly.
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  const accountFilter = intParam(searchParams, 'account')
  const typeFilter = searchParams.get('type')
  const budgetFilter = intParam(searchParams, 'budget')
  const categoryFilter = intParam(searchParams, 'category')
  const amountMin = searchParams.get('amount_min') ?? ''
  const amountMax = searchParams.get('amount_max') ?? ''
  const dateFrom = searchParams.get('from') ?? ''
  const dateTo = searchParams.get('to') ?? ''
  const page = intParam(searchParams, 'page') ?? 1

  const [pageSize, setPageSize] = useState(25)

  const updateParams = (patch: Record<string, string | number | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        // Any filter change invalidates the current page number.
        if (!('page' in patch)) next.delete('page')
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(key)
          else next.set(key, String(value))
        }
        return next
      },
      { replace: true },
    )
  }

  const activeFilterCount = [
    accountFilter,
    typeFilter,
    budgetFilter,
    categoryFilter,
    amountMin || amountMax ? 1 : null,
    dateFrom || dateTo ? 1 : null,
  ].filter(Boolean).length

  // Deep links with filters land with the panel already open.
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount > 0)

  const clearFilters = () =>
    updateParams({ account: null, type: null, budget: null, category: null, amount_min: null, amount_max: null, from: null, to: null })

  const isTouch = useIsTouch()

  const [formOpen, setFormOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  // Touch replacement for the hover-revealed row actions (plan decision 7).
  const [actionTarget, setActionTarget] = useState<Transaction | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, pageSize, search, accountFilter, typeFilter, budgetFilter, categoryFilter, amountMin, amountMax, dateFrom, dateTo],
    queryFn: () =>
      transactionsApi.getAll({
        page,
        page_size: pageSize,
        search: search || undefined,
        account_id: accountFilter ?? undefined,
        transaction_type: typeFilter ? [typeFilter] : undefined,
        budget_id: budgetFilter ?? undefined,
        category_id: categoryFilter ? [categoryFilter] : undefined,
        amount_gte: amountParam(amountMin),
        amount_lte: amountParam(amountMax),
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
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

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (t: Transaction) => { setEditing(t); setFormOpen(true) }

  const showAccountColumn = accounts.length > 1
  const items = data?.items ?? []

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const budgetNames = useMemo(() => new Map(budgets.map((b) => [b.id, b.name])), [budgets])
  // Budget filter narrows the category picker; without one, cross-budget
  // categories disambiguate with their budget's name.
  const categoryOptions = useMemo(
    () =>
      categories
        .filter((c) => !budgetFilter || c.budget_id === budgetFilter)
        .map((c) => ({
          value: c.id,
          label:
            !budgetFilter && budgets.length > 1
              ? `${c.name} · ${budgetNames.get(c.budget_id) ?? ''}`
              : c.name,
        })),
    [categories, budgetFilter, budgets.length, budgetNames],
  )

  const setBudgetFilter = (value: number) => {
    const category = categories.find((c) => c.id === categoryFilter)
    // Keep the category only if it belongs to the newly chosen budget.
    updateParams({ budget: value, category: category && category.budget_id === value ? category.id : null })
  }

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">Transactions</h1>
        {/* Hidden on mobile: the FAB quick-add owns creation there (plan decision 6). */}
        {canWrite && (
          <div className="flex items-center gap-2 max-sm:hidden">
            {extractionEnabled && (
              <button onClick={() => setReceiptOpen(true)} className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors inline-flex items-center gap-1">
                <ScanLine size={13} /> From receipt
              </button>
            )}
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
        <FiltersToggle open={filtersOpen} count={activeFilterCount} onToggle={() => setFiltersOpen((v) => !v)} />
      </div>

      {filtersOpen && (
        <FilterPanel onClear={activeFilterCount > 0 ? clearFilters : null}>
          {showAccountColumn && (
            <FilterField label="Account">
              <Select value={accountFilter} onChange={(v) => updateParams({ account: v })} options={accountOptions} placeholder="All accounts" aria-label="Filter by account" />
            </FilterField>
          )}
          <FilterField label="Type">
            <Select value={typeFilter} onChange={(v) => updateParams({ type: v })} options={TYPE_OPTIONS} placeholder="All types" aria-label="Filter by type" />
          </FilterField>
          {budgets.length > 0 && (
            <FilterField label="Budget">
              <Select value={budgetFilter} onChange={setBudgetFilter} options={budgetOptions} placeholder="All budgets" aria-label="Filter by budget" />
            </FilterField>
          )}
          {categories.length > 0 && (
            <FilterField label="Category">
              <Select value={categoryFilter} onChange={(v) => updateParams({ category: v })} options={categoryOptions} placeholder="All categories" aria-label="Filter by category" searchable />
            </FilterField>
          )}
          <FilterField label="Amount">
            <div className="flex items-center gap-1.5">
              <AmountInput value={amountMin} onCommit={(v) => updateParams({ amount_min: v || null })} placeholder="Min" aria-label="Minimum amount" />
              <span className="text-text-muted text-xs">–</span>
              <AmountInput value={amountMax} onCommit={(v) => updateParams({ amount_max: v || null })} placeholder="Max" aria-label="Maximum amount" />
            </div>
          </FilterField>
          <FilterField label="Date" className="col-span-2">
            <div className="flex items-center gap-1.5">
              <input type="date" value={dateFrom} onChange={(e) => updateParams({ from: e.target.value || null })} aria-label="From date" className={`${inputClass} max-sm:min-h-[44px]`} />
              <span className="text-text-muted text-xs">–</span>
              <input type="date" value={dateTo} onChange={(e) => updateParams({ to: e.target.value || null })} aria-label="To date" className={`${inputClass} max-sm:min-h-[44px]`} />
            </div>
          </FilterField>
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
              {...(isTouch && canWrite ? tappableProps(() => setActionTarget(t)) : {})}
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
                    <button onClick={() => openEdit(t)} className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                    <button onClick={() => setDeleting(t)} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
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
            onPageSizeChange={(s) => { setPageSize(s); updateParams({ page: null }) }}
          />
        </div>
      )}

      <ActionSheet
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.description}
        actions={[
          { label: 'Edit', icon: Pencil, onSelect: () => actionTarget && openEdit(actionTarget) },
          { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => actionTarget && setDeleting(actionTarget) },
        ]}
      />
      <TransactionFormModal open={formOpen} onClose={() => setFormOpen(false)} transaction={editing} />
      <NewFromReceiptModal open={receiptOpen} onClose={() => setReceiptOpen(false)} />
      <ConfirmDialog
        isOpen={!!deleting}
        title="Delete transaction"
        message={`Delete "${deleting?.description}"?`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
