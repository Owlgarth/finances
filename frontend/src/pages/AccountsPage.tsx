import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, ArrowLeftRight, Archive, Pencil, Receipt, Wallet, Landmark, Coins, Repeat, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { accountsApi, reportsApi, transfersApi } from '../api/client'
import type { Account, AccountType, Transfer } from '../types'
import { useEnabledCurrencies, useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import ActionSheet from '../components/common/ActionSheet'
import AccountFormModal from '../components/accounts/AccountFormModal'
import SetBalanceModal from '../components/accounts/SetBalanceModal'
import TransferModal from '../components/accounts/TransferModal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import WorkspaceSettingsPanel from '../components/layout/WorkspaceSettingsPanel'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

const TYPE_ICON: Record<AccountType, typeof Wallet> = { cash: Coins, bank: Landmark, other: Wallet }

export default function AccountsPage() {
  const { t } = useTranslation('accounts')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { canManageAccounts, canWrite, canManageCurrencies } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const { data: currencies = [] } = useEnabledCurrencies()
  const isTouch = useIsTouch()
  const [showArchived, setShowArchived] = useState(false)
  // Selected account for the touch action sheet that replaces the desktop
  // inline card action links.
  const [cardAction, setCardAction] = useState<Account | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [setBalanceFor, setSetBalanceFor] = useState<Account | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [repeatTransfer, setRepeatTransfer] = useState<Transfer | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)
  // Workspace settings opened from the account form's currency bridge; the
  // panel instance renders LAST so it stacks above the still-open form.
  const [settingsOpen, setSettingsOpen] = useState(false)

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
  // Card grid in enabled-currency creation order (the workspace's primary
  // first), stable within a currency (Array.prototype.sort is stable in
  // modern JS engines).
  const rank = new Map(currencies.map((c, i) => [c.code, i]))
  const sortedAccounts = [...accounts].sort(
    (a, b) => (rank.get(a.currency_code) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.currency_code) ?? Number.MAX_SAFE_INTEGER),
  )

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) => accountsApi.setArchive(id, archived),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('toast.archiveFailed'))),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(t('toast.deleted'))
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('toast.deleteFailed')))
      setDeleting(null)
    },
  })

  const openNew = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (a: Account) => { setEditing(a); setFormOpen(true) }
  const openTransfer = (repeat: Transfer | null = null) => { setRepeatTransfer(repeat); setTransferOpen(true) }

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">{t('title')}</h1>
        <div className="flex items-center gap-2">
          {/* Hidden on mobile: the FAB quick-add has Transfer. */}
          {canWrite && (
            <button onClick={() => openTransfer()} className={`${secondaryButtonClass} max-sm:hidden`}>
              <ArrowLeftRight size={13} className="inline mr-1" /> {t('actions.transfer')}
            </button>
          )}
          {canManageAccounts && (
            <button onClick={openNew} className={primaryButtonClass}>
              <Plus size={13} className="inline mr-1" /> {t('actions.newAccount')}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1].map((i) => <div key={i} className="h-24 bg-surface-muted rounded-sm animate-pulse" />)}
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-text-muted">{t('emptyState')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sortedAccounts.map((account) => {
            const Icon = TYPE_ICON[account.type]
            const balance = balanceByAccount.get(account.id) ?? account.opening_balance
            return (
              <div
                key={account.id}
                {...(isTouch && canManageAccounts ? tappableProps(() => setCardAction(account)) : {})}
                className={`border border-border rounded-sm bg-surface p-4 ${
                  isTouch && canManageAccounts ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={16} className="text-text-muted flex-shrink-0" />
                    <span className="text-sm font-medium text-text truncate">{account.name}</span>
                    {account.is_archived && (
                      <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted border border-border rounded-sm px-1.5 py-0.5">{t('accountCard.archivedBadge')}</span>
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
                {/* Inline links are pointer-fine only - card tap opens the sheet on touch. */}
                {canManageAccounts && !isTouch && (
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <button type="button" onClick={() => navigate(`/transactions?account=${account.id}`)} className="text-primary hover:text-primary-hover">{t('accountCard.viewTransactions')}</button>
                    <button onClick={() => setSetBalanceFor(account)} className="text-primary hover:text-primary-hover">{t('accountCard.setBalance')}</button>
                    <button onClick={() => openEdit(account)} className="text-text-muted hover:text-text inline-flex items-center gap-1"><Pencil size={12} /> {t('accountCard.edit')}</button>
                    <button
                      onClick={() => archiveMutation.mutate({ id: account.id, archived: !account.is_archived })}
                      className="text-text-muted hover:text-text inline-flex items-center gap-1"
                    >
                      <Archive size={12} /> {account.is_archived ? t('accountCard.unarchive') : t('accountCard.archive')}
                    </button>
                    {account.is_archived && (
                      <button onClick={() => setDeleting(account)} className="text-text-muted hover:text-negative inline-flex items-center gap-1">
                        <Trash2 size={12} /> {t('accountCard.delete')}
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
        <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer max-sm:min-h-[44px]">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t('showArchivedLabel')}
        </label>
      </div>

      {/* Latest transfer history preview */}
      {(transfers?.items.length ?? 0) > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text">{t('recentTransfers.title')}</h2>
            <Link to="/transfers" className="text-xs text-primary hover:text-primary-hover touch-hit">{t('recentTransfers.viewAll')}</Link>
          </div>
          <div className="border border-border rounded-sm bg-surface divide-y divide-border">
            {transfers!.items.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="text-text truncate">
                    {row.from_account_name} → {row.to_account_name}
                    {row.description && <span className="text-text-muted"> · {row.description}</span>}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted">{row.date}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                  {/* Cross-currency: second small line instead of one long string
                      that would overflow 375px. */}
                  <span className="font-mono text-text text-right">
                    <span className="whitespace-nowrap">{formatAmount(row.from_amount)} {row.from_currency_code}</span>
                    {row.from_currency_code !== row.to_currency_code && (
                      <span className="block text-[10px] text-text-muted whitespace-nowrap">
                        → {formatAmount(row.to_amount)} {row.to_currency_code}
                      </span>
                    )}
                  </span>
                  {canWrite && (
                    <button onClick={() => openTransfer(row)} className="text-text-muted hover:text-primary touch-hit" title={t('recentTransfers.repeatTitle')} aria-label={t('recentTransfers.repeatAria')}>
                      <Repeat size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ActionSheet
        open={!!cardAction}
        onClose={() => setCardAction(null)}
        title={cardAction?.name}
        actions={[
          { label: t('accountCard.viewTransactions'), icon: Receipt, onSelect: () => cardAction && navigate(`/transactions?account=${cardAction.id}`) },
          { label: t('accountCard.setBalance'), icon: Coins, onSelect: () => cardAction && setSetBalanceFor(cardAction) },
          { label: t('accountCard.edit'), icon: Pencil, onSelect: () => cardAction && openEdit(cardAction) },
          {
            label: cardAction?.is_archived ? t('accountCard.unarchive') : t('accountCard.archive'),
            icon: Archive,
            onSelect: () =>
              cardAction && archiveMutation.mutate({ id: cardAction.id, archived: !cardAction.is_archived }),
          },
          ...(cardAction?.is_archived
            ? [{ label: t('accountCard.delete'), icon: Trash2, destructive: true, onSelect: () => cardAction && setDeleting(cardAction) }]
            : []),
        ]}
      />
      <AccountFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        account={editing}
        onManageCurrencies={canManageCurrencies ? () => setSettingsOpen(true) : undefined}
      />
      {setBalanceFor && (
        <SetBalanceModal open={!!setBalanceFor} onClose={() => setSetBalanceFor(null)} account={setBalanceFor} />
      )}
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} repeatFrom={repeatTransfer} />
      <ConfirmDialog
        isOpen={!!deleting}
        title={t('confirmDelete.title')}
        message={t('confirmDelete.message', { name: deleting?.name ?? '' })}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
      <WorkspaceSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
