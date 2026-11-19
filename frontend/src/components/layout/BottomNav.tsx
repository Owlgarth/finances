import { useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Calendar,
  CloudOff,
  FileText,
  Landmark,
  LayoutDashboard,
  Plus,
  Receipt,
  Repeat,
  ScanLine,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { transactionsApi } from '../../api/client'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useExtractionConfig } from '../../hooks/useDomain'
import { getApiErrorMessage } from '../../utils/errors'
import ActionSheet, { type ActionSheetAction } from '../common/ActionSheet'
import TransactionFormModal from '../modals/transactions/TransactionFormModal'
import PlannedFormModal from '../modals/transactions/PlannedFormModal'
import RecurringFormModal from '../modals/transactions/RecurringFormModal'
import TransferModal from '../accounts/TransferModal'
import type { ParsedReceipt } from '../../types'

// Mirrors the accept list in TransactionFormModal's inline receipt upload.
const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

interface TabProps {
  to: string
  label: string
  icon: LucideIcon
  exact?: boolean
  // Sibling routes (prefix match) that also light this tab. NavLink's own
  // match covers only `to`, so a tab standing for several routes derives
  // its active state from the live pathname instead.
  activeFor?: readonly string[]
}

// components.md §19: 20px icons, 10px uppercase labels, active = text-primary.
function Tab({ to, label, icon: Icon, exact = false, activeFor }: TabProps) {
  const location = useLocation()
  const tabClass = (active: boolean) =>
    `flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 min-h-[44px] transition-colors ${
      active ? 'text-primary' : 'text-text-muted'
    }`
  return (
    <NavLink
      to={to}
      end={exact}
      className={
        activeFor
          ? () => tabClass(activeFor.some((prefix) => location.pathname.startsWith(prefix)))
          : ({ isActive }) => tabClass(isActive)
      }
    >
      <Icon size={20} strokeWidth={1.5} />
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </NavLink>
  )
}

/**
 * Mobile navigation shell (M4): five-slot bottom bar (Home, Activity, FAB,
 * Accounts, Budgets); the account menu with overflow destinations and
 * workspace/user controls lives in AccountMenuSheet, opened from the
 * page-header profile button.
 */
export default function BottomNav() {
  const { t } = useTranslation('nav')
  const { workspace } = useWorkspace()
  const { canWrite } = usePermissions()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  // Receipt-first flow: the parent owns the file picker + parse, then seeds the
  // canonical TransactionFormModal via `prefillReceipt`. Set exactly once per
  // flow (on parse success) and cleared to null in the modal's onClose wrapper,
  // so the reference is stable while the modal is open — no mid-edit re-seed.
  const [prefillReceipt, setPrefillReceipt] = useState<{ file: File; parsed: ParsedReceipt } | null>(null)
  const [plannedOpen, setPlannedOpen] = useState(false)
  const [recurringOpen, setRecurringOpen] = useState(false)

  // Always-mounted hidden file input. Its .click() is called synchronously
  // inside the "From receipt" ActionSheet onSelect (the user-gesture handler)
  // — Chrome blocks file dialogs without user activation, so a useEffect-
  // triggered click would be fragile. ActionSheet runs onSelect after onClose,
  // still inside the gesture.
  const receiptFileRef = useRef<HTMLInputElement>(null)
  // react-hot-toast id for the loading→error swap (success dismisses silently).
  const parseToastId = useRef<string | undefined>(undefined)

  const parse = useMutation({
    mutationFn: (f: File) => transactionsApi.parseReceipt(f),
    onMutate: () => {
      parseToastId.current = toast.loading(t('receiptReading'))
    },
    onSuccess: (result: ParsedReceipt, file: File) => {
      // No success toast — the form opening IS the signal.
      toast.dismiss(parseToastId.current)
      setPrefillReceipt({ file, parsed: result })
      setTransactionOpen(true)
    },
    onError: (error) => {
      // Replace the loading toast with the error (single toast, no duplicate).
      toast.error(getApiErrorMessage(error, t('receiptReadFailed')), { id: parseToastId.current })
    },
  })

  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) parse.mutate(f)
    // Same-file reselect must re-fire onChange; the File is already captured by
    // parse.mutate, so clearing the input value is safe.
    if (receiptFileRef.current) receiptFileRef.current.value = ''
  }

  const quickAddActions: ActionSheetAction[] = [
    { label: t('quickAdd.newTransaction'), icon: Receipt, onSelect: () => setTransactionOpen(true) },
    { label: t('quickAdd.transfer'), icon: ArrowLeftRight, onSelect: () => setTransferOpen(true) },
    // Shown disabled rather than dropped while the self-hosted scanner is off,
    // so the action list doesn't silently change shape.
    ...(extractionEnabled
      ? [
          extractionReachable
            ? { label: t('quickAdd.fromReceipt'), icon: ScanLine, onSelect: () => receiptFileRef.current?.click() }
            : { label: t('quickAdd.scanningOffline'), icon: CloudOff, onSelect: () => {}, disabled: true },
        ]
      : []),
    { label: t('quickAdd.plannedTransaction'), icon: Calendar, onSelect: () => setPlannedOpen(true) },
    { label: t('quickAdd.recurringRule'), icon: Repeat, onSelect: () => setRecurringOpen(true) },
  ]

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-bottom-nav bg-surface border-t border-border flex items-end pb-safe">
        <Tab to="/" label={t('home')} icon={LayoutDashboard} exact />
        <Tab
          to="/transactions"
          label={t('activity')}
          icon={FileText}
          activeFor={['/transactions', '/planned', '/transfers']}
        />

        {/* Center FAB slot — kept even when the FAB is hidden (viewer role /
            no workspace) so the four tabs don't shift. */}
        <div className="flex-1 flex flex-col items-center">
          {workspace && canWrite && (
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              aria-label={t('addRecord')}
              className="-mt-5 w-12 h-12 bg-primary border border-border rounded-sm flex items-center justify-center text-background hover:bg-primary-hover active:scale-95 transition-all"
            >
              <Plus size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>

        <Tab to="/accounts" label={t('accounts')} icon={Landmark} />
        <Tab to="/budgets" label={t('budgets')} icon={Wallet} />
      </nav>

      {/* FAB quick-add - owned here so it works on any route */}
      <ActionSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        actions={quickAddActions}
      />
      <TransactionFormModal
        open={transactionOpen}
        prefillReceipt={prefillReceipt}
        onClose={() => {
          setTransactionOpen(false)
          setPrefillReceipt(null)
        }}
      />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
      <PlannedFormModal open={plannedOpen} onClose={() => setPlannedOpen(false)} />
      <RecurringFormModal open={recurringOpen} onClose={() => setRecurringOpen(false)} />

      {/* Receipt-first picker — always mounted so .click() works in the gesture. */}
      {/* No `capture` attribute: it makes mobile browsers open the camera directly instead of the source chooser - existing photos/files must stay pickable. */}
      <input
        ref={receiptFileRef}
        type="file"
        accept={ACCEPT}
        onChange={handleReceiptFile}
        className="hidden"
      />
    </>
  )
}
