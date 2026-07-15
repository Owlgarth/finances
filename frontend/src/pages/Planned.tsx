import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, CheckCircle } from 'lucide-react'
import { plannedTransactionsApi } from '../api/client'
import type { PlannedTransaction } from '../types'
import { useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { useIsTouch } from '../hooks/useBreakpoint'
import PlannedFormModal from '../components/modals/transactions/PlannedFormModal'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Pagination from '../components/common/Pagination'
import SegmentedControl from '../components/common/SegmentedControl'
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

  const isTouch = useIsTouch()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PlannedTransaction | null>(null)
  const [deleting, setDeleting] = useState<PlannedTransaction | null>(null)
  // Touch replacement for the hover-revealed row actions (plan decision 7).
  const [actionTarget, setActionTarget] = useState<PlannedTransaction | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const { data, isLoading } = useQuery({
    queryKey: ['planned', statusFilter, page, pageSize],
    queryFn: () =>
      plannedTransactionsApi.getAll({
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        page_size: pageSize,
      }),
  })
  const items = data?.items ?? []

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

      <div className="mb-4">
        <SegmentedControl
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1) }}
          options={STATUS_OPTIONS}
          aria-label="Filter by status"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">
          {statusFilter === 'all' ? 'No planned transactions.' : `No ${statusFilter} planned transactions.`}
        </p>
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {items.map((p) => (
            <div
              key={p.id}
              onClick={
                isTouch && canWrite && p.status === 'pending' ? () => setActionTarget(p) : undefined
              }
              className={`flex items-center justify-between px-4 py-3 text-sm group ${
                isTouch && canWrite && p.status === 'pending'
                  ? 'active:bg-surface-hover transition-colors cursor-pointer'
                  : ''
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
                {canWrite && !isTouch && p.status === 'pending' && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => executeMutation.mutate(p)} className="text-text-muted hover:text-positive p-1" title="Execute"><CheckCircle size={13} /></button>
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
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
            />
          )}
        </div>
      )}

      <ActionSheet
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.name}
        actions={[
          { label: 'Execute now', icon: CheckCircle, onSelect: () => actionTarget && executeMutation.mutate(actionTarget) },
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
