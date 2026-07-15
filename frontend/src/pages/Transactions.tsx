import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, ScanLine } from 'lucide-react'
import { transactionsApi } from '../api/client'
import type { Transaction } from '../types'
import { useAccounts, useMultiCurrency, useExtractionEnabled } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { useIsTouch } from '../hooks/useBreakpoint'
import TransactionFormModal from '../components/modals/transactions/TransactionFormModal'
import NewFromReceiptModal from '../components/modals/transactions/NewFromReceiptModal'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Pagination from '../components/common/Pagination'
import Select from '../components/common/Select'
import { primaryButtonClass } from '../components/common/formStyles'

const TYPE_STYLE: Record<string, string> = {
  income: 'text-positive',
  expense: 'text-negative',
  adjustment: 'text-warning',
}

export default function Transactions() {
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const extractionEnabled = useExtractionEnabled()
  const { data: accounts = [] } = useAccounts(false)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [accountFilter, setAccountFilter] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const isTouch = useIsTouch()

  const [formOpen, setFormOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  // Touch replacement for the hover-revealed row actions (plan decision 7).
  const [actionTarget, setActionTarget] = useState<Transaction | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, pageSize, accountFilter, typeFilter],
    queryFn: () =>
      transactionsApi.getAll({
        page,
        page_size: pageSize,
        account_id: accountFilter ?? undefined,
        transaction_type: typeFilter ? [typeFilter] : undefined,
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
  const typeOptions = [
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
    { value: 'adjustment', label: 'Adjustment' },
  ]

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

      <div className="flex flex-wrap gap-3 mb-4">
        {showAccountColumn && (
          <div className="w-48 max-sm:w-auto max-sm:flex-1">
            <Select value={accountFilter} onChange={(v) => { setAccountFilter(v); setPage(1) }} options={accountOptions} placeholder="All accounts" aria-label="Filter by account" />
          </div>
        )}
        <div className="w-40 max-sm:w-auto max-sm:flex-1">
          <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1) }} options={typeOptions} placeholder="All types" aria-label="Filter by type" />
        </div>
        {(accountFilter || typeFilter) && (
          <button onClick={() => { setAccountFilter(null); setTypeFilter(null); setPage(1) }} className="text-xs text-text-muted hover:text-text max-sm:min-h-[44px] max-sm:w-full max-sm:text-left">
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">No transactions yet.</p>
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {items.map((t) => (
            <div
              key={t.id}
              onClick={isTouch && canWrite ? () => setActionTarget(t) : undefined}
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
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
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
