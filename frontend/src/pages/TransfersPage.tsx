import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeftRight, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { transfersApi } from '../api/client'
import type { Transfer } from '../types'
import { useAccounts } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { createUpdateParams, intParam } from '../utils/params'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'
import Select from '../components/common/Select'
import TransferModal from '../components/accounts/TransferModal'
import { FilterPanel, FilterField } from '../components/common/FilterBar'
import { inputClass, primaryButtonClass } from '../components/common/formStyles'

export default function TransfersPage() {
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const isTouch = useIsTouch()
  const { data: accounts = [] } = useAccounts(false)

  // Filter state lives in the URL (shareable, back-button friendly); any
  // filter change resets pagination via createUpdateParams.
  const [searchParams, setSearchParams] = useSearchParams()
  const account = intParam(searchParams, 'account')
  const dateFrom = searchParams.get('from') ?? ''
  const dateTo = searchParams.get('to') ?? ''
  const page = intParam(searchParams, 'page') ?? 1
  const updateParams = createUpdateParams(setSearchParams)

  const [pageSize, setPageSize] = useState(getStoredPageSize)

  const hasFilters = account != null || Boolean(dateFrom || dateTo)

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

  const [transferOpen, setTransferOpen] = useState(false)
  const [repeatTransfer, setRepeatTransfer] = useState<Transfer | null>(null)
  // Edit prefill is fetched, not taken from the row, so the modal always
  // saves against server truth. Keyed INSIDE the ['transfers'] family so the
  // modal's own save invalidations refetch it (a sibling key would serve a
  // stale row within staleTime after an edit).
  const [editingId, setEditingId] = useState<number | null>(null)
  const { data: editData } = useQuery({
    queryKey: ['transfers', 'detail', editingId],
    queryFn: () => transfersApi.get(editingId!),
    enabled: editingId != null,
  })
  // Touch replacement for the desktop hover actions.
  const [rowAction, setRowAction] = useState<Transfer | null>(null)
  const [deleting, setDeleting] = useState<Transfer | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transfersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      toast.success('Transfer deleted')
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete transfer'))
      setDeleting(null)
    },
  })

  const openCreate = () => { setRepeatTransfer(null); setTransferOpen(true) }
  const openRepeat = (t: Transfer) => { setRepeatTransfer(t); setTransferOpen(true) }

  const clearFilters = () => updateParams({ account: null, from: null, to: null })

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const items = data?.items ?? []

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">Transfers</h1>
        <div className="flex items-center gap-2">
          {/* Hidden on mobile: the FAB quick-add has Transfer. */}
          {canWrite && (
            <button type="button" onClick={openCreate} className={`${primaryButtonClass} max-sm:hidden`}>
              <Plus size={13} className="inline mr-1" /> New transfer
            </button>
          )}
        </div>
      </div>

      {/* Always visible: three controls don't justify a collapsible panel. */}
      <FilterPanel onClear={hasFilters ? clearFilters : null}>
        <FilterField label="Account">
          <Select
            value={account}
            onChange={(v) => updateParams({ account: v })}
            options={accountOptions}
            placeholder="All accounts"
            aria-label="Filter by account"
          />
        </FilterField>
        <FilterField label="Date" className="col-span-2">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => updateParams({ from: e.target.value || null })}
              aria-label="From date"
              className={`${inputClass} max-sm:min-h-[44px]`}
            />
            <span className="text-text-muted text-xs">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => updateParams({ to: e.target.value || null })}
              aria-label="To date"
              className={`${inputClass} max-sm:min-h-[44px]`}
            />
          </div>
        </FilterField>
      </FilterPanel>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        hasFilters ? (
          <p className="text-sm text-text-muted">No transfers match your filters.</p>
        ) : (
          <EmptyState
            icon={<ArrowLeftRight size={48} strokeWidth={1.5} className="text-text-muted/30" />}
            heading="No transfers yet"
            message="Record a transfer from Accounts or the create menu; it will appear here."
          />
        )
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {items.map((t) => (
            <div
              key={t.id}
              {...(isTouch && canWrite ? tappableProps(() => setRowAction(t)) : {})}
              className={`flex items-center justify-between px-4 py-2.5 text-sm group ${
                isTouch && canWrite ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-text truncate">
                  {t.from_account_name} → {t.to_account_name}
                  {t.description && <span className="text-text-muted"> · {t.description}</span>}
                </div>
                <div className="text-[10px] font-mono text-text-muted">{t.date}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                {/* Cross-currency: second small line instead of one long string
                    that would overflow 375px. */}
                <span className="font-mono text-text text-right">
                  <span className="whitespace-nowrap">{formatAmount(t.from_amount)} {t.from_currency_code}</span>
                  {t.from_currency_code !== t.to_currency_code && (
                    <span className="block text-[10px] text-text-muted whitespace-nowrap">
                      → {formatAmount(t.to_amount)} {t.to_currency_code}
                    </span>
                  )}
                </span>
                {/* Hover reveals are pointer-fine only - on touch they'd be
                    invisible tap targets; the row tap opens the sheet instead. */}
                {canWrite && !isTouch && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => setEditingId(t.id)} title="Edit" aria-label="Edit transfer" className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                    <button type="button" onClick={() => openRepeat(t)} title="Repeat" aria-label="Repeat transfer" className="text-text-muted hover:text-text p-1"><Repeat size={13} /></button>
                    <button type="button" onClick={() => setDeleting(t)} title="Delete" aria-label="Delete transfer" className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
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

      <ActionSheet
        open={!!rowAction}
        onClose={() => setRowAction(null)}
        title={rowAction ? `${rowAction.from_account_name} → ${rowAction.to_account_name}` : undefined}
        actions={[
          { label: 'Edit', icon: Pencil, onSelect: () => rowAction && setEditingId(rowAction.id) },
          { label: 'Repeat', icon: Repeat, onSelect: () => rowAction && openRepeat(rowAction) },
          { label: 'Delete', icon: Trash2, destructive: true, onSelect: () => rowAction && setDeleting(rowAction) },
        ]}
      />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} repeatFrom={repeatTransfer} />
      {/* Edit modal (mount-per-use): mounts only once the prefetched transfer
          is loaded, so the form never opens against stale/missing data. */}
      {editingId != null && editData && (
        <TransferModal open onClose={() => setEditingId(null)} editFrom={editData} />
      )}
      <ConfirmDialog
        isOpen={!!deleting}
        title="Delete transfer"
        message={`Delete this transfer from "${deleting?.from_account_name}" to "${deleting?.to_account_name}"? Both sides will be removed.`}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
