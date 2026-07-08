import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { transactionsApi } from '../api/client'
import type { Transaction } from '../types'
import { useAccounts, useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import TransactionFormModal from '../components/modals/transactions/TransactionFormModal'
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
  const { data: accounts = [] } = useAccounts(false)

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [accountFilter, setAccountFilter] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">Transactions</h1>
        {canWrite && (
          <button onClick={openNew} className={primaryButtonClass}>
            <Plus size={13} className="inline mr-1" /> New transaction
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        {showAccountColumn && (
          <div className="w-48">
            <Select value={accountFilter} onChange={(v) => { setAccountFilter(v); setPage(1) }} options={accountOptions} placeholder="All accounts" aria-label="Filter by account" />
          </div>
        )}
        <div className="w-40">
          <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1) }} options={typeOptions} placeholder="All types" aria-label="Filter by type" />
        </div>
        {(accountFilter || typeFilter) && (
          <button onClick={() => { setAccountFilter(null); setTypeFilter(null); setPage(1) }} className="text-xs text-text-muted hover:text-text">
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
            <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm group">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-text truncate">{t.description}</span>
                  {t.type === 'adjustment' && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-warning border border-warning/40 rounded-sm px-1">Adj</span>
                  )}
                </div>
                <div className="text-[10px] font-mono text-text-muted flex items-center gap-2">
                  <span>{t.date}</span>
                  {t.category_name && <span>· {t.category_name}</span>}
                  {showAccountColumn && <span>· {t.account_name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className={`font-mono ${TYPE_STYLE[t.type]}`}>
                    {t.type === 'expense' ? '−' : t.type === 'income' ? '+' : ''}
                    {formatAmount(t.amount)} {multiCurrency ? t.currency_code : ''}
                  </span>
                  {t.original_amount && t.original_currency_code && (
                    <div className="text-[10px] font-mono text-text-muted">
                      {formatAmount(t.original_amount)} {t.original_currency_code}
                    </div>
                  )}
                </div>
                {canWrite && (
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

      <TransactionFormModal open={formOpen} onClose={() => setFormOpen(false)} transaction={editing} />
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
