import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, ArrowLeftRight, Archive, Pencil, Wallet, Landmark, Coins, Repeat, Trash2 } from 'lucide-react'
import { accountsApi, reportsApi, transfersApi } from '../api/client'
import type { Account, AccountType, Transfer } from '../types'
import { useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import AccountFormModal from '../components/accounts/AccountFormModal'
import SetBalanceModal from '../components/accounts/SetBalanceModal'
import TransferModal from '../components/accounts/TransferModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

const TYPE_ICON: Record<AccountType, typeof Wallet> = { cash: Coins, bank: Landmark, other: Wallet }

export default function AccountsPage() {
  const queryClient = useQueryClient()
  const { canManageAccounts, canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const [showArchived, setShowArchived] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [setBalanceFor, setSetBalanceFor] = useState<Account | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [repeatTransfer, setRepeatTransfer] = useState<Transfer | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts', showArchived],
    queryFn: () => accountsApi.list(showArchived),
  })
  const { data: balances } = useQuery({
    queryKey: ['current-balances', showArchived],
    queryFn: () => reportsApi.currentBalances(showArchived),
  })
  const { data: transfers } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => transfersApi.getAll({ page_size: 10 }),
  })

  const balanceByAccount = new Map((balances?.accounts ?? []).map((r) => [r.account_id, r.balance]))

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) => accountsApi.setArchive(id, archived),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to archive account')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success('Account deleted')
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete account'))
      setDeleting(null)
    },
  })

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (a: Account) => { setEditing(a); setFormOpen(true) }
  const openTransfer = (repeat: Transfer | null = null) => { setRepeatTransfer(repeat); setTransferOpen(true) }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">Accounts</h1>
        <div className="flex items-center gap-2">
          {canWrite && (
            <button onClick={() => openTransfer()} className={secondaryButtonClass}>
              <ArrowLeftRight size={13} className="inline mr-1" /> Transfer
            </button>
          )}
          {canManageAccounts && (
            <button onClick={openNew} className={primaryButtonClass}>
              <Plus size={13} className="inline mr-1" /> New account
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1].map((i) => <div key={i} className="h-24 bg-surface-muted rounded-sm animate-pulse" />)}
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-text-muted">No accounts yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map((account) => {
            const Icon = TYPE_ICON[account.type]
            const balance = balanceByAccount.get(account.id) ?? account.opening_balance
            return (
              <div key={account.id} className="border border-border rounded-sm bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={16} className="text-text-muted flex-shrink-0" />
                    <span className="text-sm font-medium text-text truncate">{account.name}</span>
                    {account.is_archived && (
                      <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted border border-border rounded-sm px-1.5 py-0.5">Archived</span>
                    )}
                  </div>
                  {multiCurrency && (
                    <span className="text-[10px] font-mono text-text-muted border border-border rounded-sm px-1.5 py-0.5">
                      {account.currency_code}
                    </span>
                  )}
                </div>
                <div className="mt-3 font-mono text-xl text-text">
                  {formatAmount(balance)} {multiCurrency ? '' : account.currency_code}
                </div>
                {canManageAccounts && (
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <button onClick={() => setSetBalanceFor(account)} className="text-primary hover:text-primary-hover">Set balance…</button>
                    <button onClick={() => openEdit(account)} className="text-text-muted hover:text-text inline-flex items-center gap-1"><Pencil size={12} /> Edit</button>
                    <button
                      onClick={() => archiveMutation.mutate({ id: account.id, archived: !account.is_archived })}
                      className="text-text-muted hover:text-text inline-flex items-center gap-1"
                    >
                      <Archive size={12} /> {account.is_archived ? 'Unarchive' : 'Archive'}
                    </button>
                    {account.is_archived && (
                      <button onClick={() => setDeleting(account)} className="text-text-muted hover:text-negative inline-flex items-center gap-1">
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4">
        <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived accounts
        </label>
      </div>

      {/* Recent transfers */}
      {(transfers?.items.length ?? 0) > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-text mb-3">Recent transfers</h2>
          <div className="border border-border rounded-sm bg-surface divide-y divide-border">
            {transfers!.items.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="text-text">{t.from_account_name} → {t.to_account_name}</span>
                  {t.description && <span className="text-text-muted ml-2 truncate">{t.description}</span>}
                  <div className="text-[10px] font-mono text-text-muted">{t.date}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-text">
                    {formatAmount(t.from_amount)} {t.from_currency_code}
                    {t.from_currency_code !== t.to_currency_code && ` → ${formatAmount(t.to_amount)} ${t.to_currency_code}`}
                  </span>
                  {canWrite && (
                    <button onClick={() => openTransfer(t)} className="text-text-muted hover:text-primary" title="Repeat">
                      <Repeat size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AccountFormModal open={formOpen} onClose={() => setFormOpen(false)} account={editing} />
      {setBalanceFor && (
        <SetBalanceModal open={!!setBalanceFor} onClose={() => setSetBalanceFor(null)} account={setBalanceFor} />
      )}
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} repeatFrom={repeatTransfer} />
      <ConfirmDialog
        isOpen={!!deleting}
        title="Delete account"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
