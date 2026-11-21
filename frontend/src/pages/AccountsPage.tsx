import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, ArrowLeftRight, ChevronRight, Wallet, Landmark, Coins } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { accountsApi, reportsApi, transfersApi } from '../api/client'
import type { AccountType, Transfer } from '../types'
import { useEnabledCurrencies, useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { formatAmount } from '../utils/format'
import { useBreakpoint } from '../hooks/useBreakpoint'
import ArchivedBadge from '../components/common/ArchivedBadge'
import AccountFormModal from '../components/accounts/AccountFormModal'
import TransferModal from '../components/accounts/TransferModal'
import PageHeader from '../components/layout/PageHeader'
import WorkspaceSettingsPanel from '../components/layout/WorkspaceSettingsPanel'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

const TYPE_ICON: Record<AccountType, typeof Wallet> = { cash: Coins, bank: Landmark, other: Wallet }

export default function AccountsPage() {
  const { t } = useTranslation('accounts')
  const navigate = useNavigate()
  const { canManageAccounts, canWrite, canManageCurrencies } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const { data: currencies = [] } = useEnabledCurrencies()
  const { isDesktop } = useBreakpoint()
  const [showArchived, setShowArchived] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [repeatTransfer, setRepeatTransfer] = useState<Transfer | null>(null)
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
  // Card grid and the per-currency totals in enabled-currency creation
  // order (the workspace's primary first), stable within a currency
  // (Array.prototype.sort is stable in modern JS engines); unknown codes
  // sort last.
  const rank = new Map(currencies.map((c, i) => [c.code, i]))
  const sortedAccounts = [...accounts].sort(
    (a, b) => (rank.get(a.currency_code) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.currency_code) ?? Number.MAX_SAFE_INTEGER),
  )
  const currencyTotals = Object.entries(balances?.totals ?? {}).sort(
    (a, b) =>
      (rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER),
  )

  const openNew = () => { setFormOpen(true) }
  const openTransfer = (repeat: Transfer | null = null) => { setRepeatTransfer(repeat); setTransferOpen(true) }

  // Below 1024 the transfer entry is the /new page with type=transfer;
  // 1024+ keeps the modal.
  const handleTransfer = () => {
    if (isDesktop) {
      openTransfer()
      return
    }
    navigate('/new?type=transfer')
  }

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <PageHeader
        title={t('title')}
        actions={
          <>
            {/* Hidden on phones (the FAB owns creation there); on tablets
                below 1024 it navigates to /new?type=transfer, at 1024+ it
                opens the create modal. */}
            {canWrite && (
              <button type="button" onClick={handleTransfer} className={`${secondaryButtonClass} max-sm:hidden`}>
                <ArrowLeftRight size={13} className="inline mr-1" /> {t('actions.transfer')}
              </button>
            )}
            {canManageAccounts && (
              <button onClick={openNew} className={primaryButtonClass}>
                <Plus size={13} className="inline mr-1" /> {t('actions.newAccount')}
              </button>
            )}
          </>
        }
        showAccountActions
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1].map((i) => <div key={i} className="h-24 bg-surface-muted rounded-sm animate-pulse" />)}
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-text-muted">{t('emptyState')}</p>
      ) : (
        <>
          {/* Per-currency totals above the grid: one line per enabled
              currency in creation order. Currency renders as the amount
              SUFFIX in multi-currency workspaces only (the
              Sidebar/Dashboard idiom). Totals are display-only strings
              from the balances response - formatAmount, never
              arithmetic. */}
          {currencyTotals.length > 0 && (
            <div className="mb-4 space-y-1 text-sm font-mono text-text">
              {currencyTotals.map(([code, total]) => (
                <div key={code} className="whitespace-nowrap">
                  <span className="sr-only">{t('totals.label')} </span>
                  {formatAmount(total)} {multiCurrency ? code : ''}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sortedAccounts.map((account) => {
              const Icon = TYPE_ICON[account.type]
              const balance = balanceByAccount.get(account.id) ?? account.opening_balance
              return (
                <Link
                  key={account.id}
                  to={`/accounts/${account.id}`}
                  className="block border border-border rounded-sm bg-surface p-4 transition-colors cursor-pointer hover:bg-surface-hover active:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={16} className="text-text-muted shrink-0" />
                    <span className="text-sm font-medium text-text truncate">{account.name}</span>
                    {account.is_archived && (
                      <ArchivedBadge />
                    )}
                  </div>
                  {/* Currency renders as the amount SUFFIX in multi-currency
                      workspaces only - the Sidebar/Dashboard idiom. */}
                  <div className="mt-3 font-mono text-xl text-text whitespace-nowrap">
                    {formatAmount(balance)} {multiCurrency ? account.currency_code : ''}
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      )}

      <div className="mt-4">
        <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer max-sm:min-h-[44px]">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t('showArchivedLabel')}
        </label>
      </div>

      {/* The transfers surface itself (with repeat affordances) lives on
          the Transfers tab; this row is the way in, chevron-cued like
          LinkedRow's trailing cell. */}
      {(transfers?.items.length ?? 0) > 0 && (
        <Link
          to="/transfers"
          className="mt-8 flex items-center justify-between border border-border rounded-sm bg-surface px-4 py-2.5 text-sm text-text transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus pointer-coarse:min-h-[44px]"
        >
          {t('recentTransfers.viewAll')}
          <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" className="text-text-muted shrink-0" />
        </Link>
      )}

      <AccountFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        account={null}
        onManageCurrencies={canManageCurrencies ? () => setSettingsOpen(true) : undefined}
      />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} repeatFrom={repeatTransfer} />
      <WorkspaceSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
