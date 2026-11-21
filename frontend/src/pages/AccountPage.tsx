import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Archive, ArrowLeftRight, ChevronRight, Coins, Landmark, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { accountsApi, plannedTransactionsApi, reportsApi, transactionsApi, transfersApi } from '../api/client'
import type { AccountType } from '../types'
import { useMultiCurrency } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { useBreakpoint, useIsTouch } from '../hooks/useBreakpoint'
import { useMainScrollRestoration } from '../hooks/useMainScrollRestoration'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { monthRange, toIsoDate } from '../utils/dates'
import ActionSheet, { type ActionSheetAction } from '../components/common/ActionSheet'
import ArchivedBadge from '../components/common/ArchivedBadge'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { controlHeightClass, secondaryButtonClass } from '../components/common/formStyles'
import { listboxPanelClass } from '../components/common/listboxParts'
import PageHeader from '../components/layout/PageHeader'
import AccountFormModal from '../components/accounts/AccountFormModal'
import SetBalanceModal from '../components/accounts/SetBalanceModal'

const TYPE_ICON: Record<AccountType, typeof Wallet> = { cash: Coins, bank: Landmark, other: Wallet }

// PageHeader's back-button register plus a border: an icon-only header
// button. Icon-only affordances need the coarse WIDTH floor beside
// controlHeightClass - the height constant sets no width, and the height
// half alone leaves a narrow tap target on coarse pointers.
const OVERFLOW_TRIGGER_CLASS =
  'shrink-0 flex items-center justify-center rounded-sm bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-hover ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  `${controlHeightClass} pointer-coarse:min-w-[44px]`

// Menu-row twin of the filter bar's private menuRowClass (two files now;
// extract the shared piece at the third). Diverges in one way: no color
// class in the base, so a destructive row selects text-negative without
// fighting a text-text append (Tailwind v4 emits utilities alphabetically,
// so .text-text would out-cascade .text-negative; the touch ActionSheet
// resolves the same pair with a ternary).
const MENU_ROW_CLASS =
  'w-full flex items-center gap-2.5 px-3 text-left text-[13px] ' +
  `hover:bg-surface-hover transition-colors ${controlHeightClass} ` +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'

// Trailing-chevron section-header link (the LinkedRow arrow-cell register
// without the border-l): the link affordance is the chevron cell, never
// the label alone. Icon-only, so it carries both coarse floors.
const SECTION_LINK_CLASS =
  'inline-flex items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-hover hover:text-text ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  'pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]'

/** Full-page destination for a single account at every width: summary card
 *  (name, currency, balance, money in/out this month), upcoming planned
 *  items, recent transactions and transfers with per-section links into the
 *  Activity tabs, and the account actions (Add / Transfer / Set balance plus
 *  an Edit / Archive / Delete overflow menu). Archived accounts render
 *  read-only with the archived badge. No side-panel host exists for accounts,
 *  so the page hosts itself on every tier. */
export default function AccountPage() {
  const { t } = useTranslation('accounts')
  const { id: idParam } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canManageAccounts, canWrite } = usePermissions()
  const multiCurrency = useMultiCurrency()
  const isTouch = useIsTouch()
  const { isTablet } = useBreakpoint()

  // Same id discipline as TransactionRecordPage: garbage reads as unset and
  // lands on the not-found state, never on a page that queries id NaN.
  const accountId = Number(idParam)
  const validId = Number.isInteger(accountId) && accountId > 0

  // 640-1023: MainLayout's <main> is the scroll container and a content
  // swap clamps it; the hook saves/restores its scrollTop per pathname.
  useMainScrollRestoration(isTablet)

  // Account detail - keyed INSIDE the ['accounts'] family (the
  // ['transactions', 'detail', id] precedent) so every existing
  // ['accounts']-prefix invalidation (form save, archive, delete, the list
  // page's mutations) refetches it for free.
  const accountQuery = useQuery({
    queryKey: ['accounts', 'detail', accountId],
    queryFn: () => accountsApi.get(accountId),
    enabled: validId,
  })
  const account = accountQuery.data

  // Balance - the SHARED ['current-balances', is_archived] entry: the exact
  // key the Accounts list (showArchived variant), Sidebar and Dashboard
  // hold, so the rendered balance matches them by construction and every
  // existing ['current-balances'] invalidation (set-balance, form save,
  // transaction and transfer saves) refreshes it with zero extra wiring.
  // The flag follows the account: archived rows exist only in the
  // include_archived=true entry.
  const { data: balances } = useQuery({
    queryKey: ['current-balances', account?.is_archived ?? false],
    queryFn: () => reportsApi.currentBalances(account!.is_archived),
    enabled: !!account,
  })
  // The shared-entry balance for this account, when the entry has loaded.
  const sharedBalance = balances?.accounts.find((r) => r.account_id === accountId)?.balance

  // Money in/out for the current month: transactions grouped by type over
  // the calendar-month bounds. income/expense are the in/out figures;
  // transfers are excluded by construction (they have their own endpoint
  // and section) and adjustments land in neither income nor expense.
  // Keyed inside the ['transactions'] family (the list page's totals
  // precedent). group_by=type fills the response's `totals` list (by_type
  // stays null there) - the list page's strip reads the same field.
  const { from: monthFrom, to: monthTo } = monthRange(new Date().getFullYear(), new Date().getMonth())
  const { data: totalsData } = useQuery({
    queryKey: ['transactions', 'totals', 'account', accountId, monthFrom, monthTo],
    queryFn: () => transactionsApi.getTotals({ account_id: [accountId], date_from: monthFrom, date_to: monthTo, group_by: 'type' }),
    enabled: !!account,
  })
  const totalsByType = new Map(
    (totalsData?.totals ?? []).filter((r) => r.currency === account?.currency_code).map((r) => [r.group, r.total]),
  )

  // Upcoming planned: pending items in the next 30 days, earliest first,
  // 3 max. Keyed inside the ['planned'] family so pay/skip/edit
  // invalidations refetch.
  const plannedFrom = toIsoDate(new Date())
  const plannedTo = toIsoDate(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 30))
  const { data: planned } = useQuery({
    queryKey: ['planned', 'account', accountId, plannedFrom, plannedTo],
    queryFn: () => plannedTransactionsApi.getAll({ status: 'pending', account_id: [accountId], start_date: plannedFrom, end_date: plannedTo, ordering: 'planned_date', page_size: 3 }),
    enabled: !!account,
  })

  // Latest 5 transactions / transfers on this account (the transfers
  // endpoint takes a single-id account_id). Both keyed inside their
  // families.
  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', 'recent', 'account', accountId],
    queryFn: () => transactionsApi.getAll({ account_id: [accountId], ordering: '-date', page_size: 5 }),
    enabled: !!account,
  })
  const { data: transfers } = useQuery({
    queryKey: ['transfers', 'account', accountId],
    queryFn: () => transfersApi.getAll({ account_id: accountId, page_size: 5 }),
    enabled: !!account,
  })

  const [formOpen, setFormOpen] = useState(false)
  const [setBalanceOpen, setSetBalanceOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false) // touch overflow sheet only

  // Same mutations as the Accounts list plus the success notice; delete
  // returns to the list (replace keeps the dead URL out of Back's path -
  // TransactionRecordPage precedent).
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) => accountsApi.setArchive(id, archived),
    onSuccess: (_data, { archived }) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success(archived ? t('accountPage.toast.archived') : t('accountPage.toast.unarchived'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('toast.archiveFailed'))),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(t('toast.deleted'))
      navigate('/accounts', { replace: true })
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('toast.deleteFailed'))),
  })

  if (!validId || accountQuery.isError) {
    // Foreign, deleted or garbage id: say so with a link to the list -
    // never an empty page with working fields.
    return (
      <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
        <PageHeader title={t('accountPage.title')} backTo="/accounts" showAccountActions />
        <p className="text-sm text-text-muted mb-4">{t('accountPage.notFound')}</p>
        <Link to="/accounts" className={secondaryButtonClass}>
          {t('accountPage.backToAccounts')}
        </Link>
      </div>
    )
  }

  if (accountQuery.isLoading || !account) {
    // Hold, never flash: the page has no correct empty state while the
    // row loads.
    return (
      <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
        <PageHeader title={t('accountPage.title')} backTo="/accounts" showAccountActions />
        <div className="space-y-3 pt-2" aria-hidden="true">
          <div className="h-24 bg-surface-muted rounded-sm animate-pulse" />
          <div className="h-32 bg-surface-muted rounded-sm animate-pulse" />
        </div>
      </div>
    )
  }

  // Overflow menu entries: Edit, Archive/Unarchive, Delete (archived
  // only). An archived account keeps Unarchive + Delete ONLY - read-only.
  const menuActions: ActionSheetAction[] = [
    ...(!account.is_archived
      ? [{ label: t('accountCard.edit'), icon: Pencil, onSelect: () => setFormOpen(true) }]
      : []),
    {
      label: account.is_archived ? t('accountCard.unarchive') : t('accountCard.archive'),
      icon: Archive,
      onSelect: () => archiveMutation.mutate({ id: account.id, archived: !account.is_archived }),
    },
    ...(account.is_archived
      ? [{ label: t('accountCard.delete'), icon: Trash2, destructive: true, onSelect: () => setConfirmOpen(true) }]
      : []),
  ]

  const Icon = TYPE_ICON[account.type]
  // Fallback to the opening balance while the shared balances entry is
  // still in flight (the Accounts list card does the same); derived here
  // so account's post-guard narrowing applies.
  const balance = sharedBalance ?? account.opening_balance
  // Hoisted out of the JSX below: the literal-string lint flags string
  // literals inside JSX expression containers, and these map keys are
  // data sentinels, not UI text.
  const monthIn = totalsByType.get('income') ?? '0'
  const monthOut = totalsByType.get('expense') ?? '0'

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <PageHeader
        title={account.name}
        backTo="/accounts"
        showAccountActions
        actions={
          // One wrapping group: PageHeader's actions container does not
          // wrap, so the payload owns the wrapping that keeps four
          // buttons stacking cleanly at 375px instead of overflowing.
          <div className="flex flex-wrap items-center gap-2">
            {canWrite && !account.is_archived && (
              <>
                <button type="button" onClick={() => navigate(`/new?account=${account.id}`)} className={secondaryButtonClass}>
                  <Plus size={13} className="inline mr-1" /> {t('accountPage.actions.add')}
                </button>
                <button type="button" onClick={() => navigate(`/new?type=transfer&account=${account.id}`)} className={secondaryButtonClass}>
                  <ArrowLeftRight size={13} className="inline mr-1" /> {t('actions.transfer')}
                </button>
              </>
            )}
            {canManageAccounts && !account.is_archived && (
              <button type="button" onClick={() => setSetBalanceOpen(true)} className={secondaryButtonClass}>
                <Coins size={13} className="inline mr-1" /> {t('accountCard.setBalance')}
              </button>
            )}
            {canManageAccounts &&
              (isTouch ? (
                <button type="button" onClick={() => setMenuOpen(true)} aria-label={t('accountPage.actions.more')} className={OVERFLOW_TRIGGER_CLASS}>
                  <MoreHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
                </button>
              ) : (
                <OverflowMenu label={t('accountPage.actions.more')} actions={menuActions} />
              ))}
          </div>
        }
      />

      <div className="border border-border rounded-sm bg-surface p-4">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={16} className="text-text-muted shrink-0" />
          <span className="text-sm font-medium text-text truncate">{account.name}</span>
          {account.is_archived && <ArchivedBadge />}
        </div>
        {/* Currency renders as the amount SUFFIX in multi-currency
            workspaces only - the Sidebar/Dashboard idiom, not the Accounts
            card ternary (which shows the code in single-currency
            workspaces). */}
        <div className="mt-3 font-mono text-xl text-text">
          {formatAmount(balance)} {multiCurrency ? account.currency_code : ''}
        </div>
        {/* In/out in normal text color - color-positive/negative are
            reserved for fills/bars/icons, never text under 24px on light
            surfaces. */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{t('accountPage.thisMonthIn')}</div>
            <div className="font-mono text-sm text-text">
              {formatAmount(monthIn)} {multiCurrency ? account.currency_code : ''}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{t('accountPage.thisMonthOut')}</div>
            <div className="font-mono text-sm text-text">
              {formatAmount(monthOut)} {multiCurrency ? account.currency_code : ''}
            </div>
          </div>
        </div>
      </div>

      {(planned?.items.length ?? 0) > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text">{t('accountPage.sections.upcoming')}</h2>
            <Link to={`/planned?account=${account.id}`} aria-label={t('accountPage.sections.viewAllPlanned', { name: account.name })} className={SECTION_LINK_CLASS}>
              <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
          {/* Plain rows - no per-item route exists for planned items. */}
          <div className="border border-border rounded-sm bg-surface divide-y divide-border">
            {planned!.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="text-text truncate">{item.name}</div>
                  <div className="text-[10px] font-mono text-text-muted">{item.planned_date}</div>
                </div>
                <span className="font-mono text-text whitespace-nowrap">
                  {formatAmount(item.amount)} {multiCurrency ? item.currency_code : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-text">{t('accountPage.sections.transactions')}</h2>
          <Link to={`/transactions?account=${account.id}`} aria-label={t('accountPage.sections.viewAllTransactions', { name: account.name })} className={SECTION_LINK_CLASS}>
            <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
        {txLoading ? (
          <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-6 bg-surface-muted rounded-sm animate-pulse" />)}</div>
        ) : (transactions?.items.length ?? 0) === 0 ? (
          <p className="text-sm text-text-muted">{t('accountPage.empty.transactions')}</p>
        ) : (
          <div className="border border-border rounded-sm bg-surface divide-y divide-border">
            {transactions!.items.map((tx) => (
              <Link key={tx.id} to={`/transactions/${tx.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="text-text truncate">{tx.description}</div>
                  <div className="text-[10px] font-mono text-text-muted">{tx.date}</div>
                </div>
                <span className="font-mono text-text whitespace-nowrap">
                  {tx.type === 'expense' ? '−' : tx.type === 'income' ? '+' : ''}{formatAmount(tx.amount)} {multiCurrency ? tx.currency_code : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {(transfers?.items.length ?? 0) > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text">{t('accountPage.sections.transfers')}</h2>
            <Link to={`/transfers?account=${account.id}`} aria-label={t('accountPage.sections.viewAllTransfers', { name: account.name })} className={SECTION_LINK_CLASS}>
              <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
            </Link>
          </div>
          {/* Plain rows this pass - row navigation arrives with the
              transfer record route. Mirrors the Accounts list's
              recent-transfers row minus the repeat button. */}
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
                <span className="font-mono text-text text-right whitespace-nowrap">
                  {formatAmount(row.from_amount)} {row.from_currency_code}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Edit - the permanently-mounted modal seeds itself from the
          account prop (its session render-adjust); edit mode never edits
          currency, so no manage-currencies bridge is needed. */}
      <AccountFormModal open={formOpen} onClose={() => setFormOpen(false)} account={account} />
      {/* Mount-per-use (the Accounts list's set-balance wiring). */}
      {setBalanceOpen && <SetBalanceModal open onClose={() => setSetBalanceOpen(false)} account={account} />}
      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('confirmDelete.title')}
        message={t('confirmDelete.message', { name: account.name })}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate(account.id)}
        onCancel={() => setConfirmOpen(false)}
      />
      {/* Touch overflow sheet - the fine-pointer popover lives inside
          OverflowMenu. */}
      {isTouch && (
        <ActionSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={account.name} actions={menuActions} />
      )}
    </div>
  )
}

/** Fine-pointer header overflow menu: the filter bar's anchored menu
 *  pattern - relative anchor, listbox panel class with the z-popover
 *  append (paints over sticky in-flow content), outside mousedown plus
 *  consumed-Escape dismissal reading the close through a latest-ref, and
 *  focus returned to the trigger only when the mousedown landed on
 *  nothing focusable. Rows close the menu before running (the touch
 *  ActionSheet's close-then-run chaining, so an action can safely open a
 *  modal or confirm dialog). */
function OverflowMenu({ label, actions }: { label: string; actions: ActionSheetAction[] }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const closePopover = (refocus = true) => {
    setOpen(false)
    // Deferred past the mousedown default action: a focus call issued
    // inside a mousedown listener is clobbered by the browser's own focus
    // move, so the return focus lands one macrotask later.
    if (refocus) setTimeout(() => triggerRef.current?.focus(), 0)
  }

  // Dismissal listeners fire the CURRENT close path through a latest-ref:
  // a mount-time closure would refocus the trigger of a menu already
  // closed by another path.
  const closeRef = useRef(closePopover)
  useEffect(() => {
    closeRef.current = closePopover
  })

  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        // A mousedown landing on a focusable element moves focus there
        // through the browser's own default action - never steal it.
        // Anything else dismisses the menu and hands focus back to its
        // trigger.
        const target = e.target as HTMLElement | null
        const focusable = target && target.closest('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')
        closeRef.current(!focusable)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Consumed Escape: nothing beneath this menu reacts to the press.
      e.preventDefault()
      e.stopPropagation()
      closeRef.current()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={anchorRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={OVERFLOW_TRIGGER_CLASS}
      >
        <MoreHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open && (
        // Same z-popover append as the filter bar's menus - the panel
        // overlays the sticky bands it may open over.
        <div role="menu" aria-label={label} className={`${listboxPanelClass} z-popover right-0 py-1`}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                action.onSelect()
              }}
              className={`${MENU_ROW_CLASS} ${action.destructive ? 'text-negative' : 'text-text'}`}
            >
              {action.icon && <action.icon size={14} strokeWidth={1.5} className="text-text-muted shrink-0" aria-hidden="true" />}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
