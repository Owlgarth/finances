import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Calendar,
  Check,
  CloudOff,
  Home,
  Landmark,
  Loader2,
  LogOut,
  MoreHorizontal,
  PieChart,
  Plus,
  Receipt,
  RotateCw,
  ScanLine,
  Search,
  Settings,
  Users,
  Wallet,
  X,
  ZoomIn,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { transactionsApi } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useExtractionConfig } from '../../hooks/useDomain'
import { useWorkspaceSwitch } from '../../hooks/useWorkspaceSwitch'
import { getApiErrorMessage } from '../../utils/errors'
import { isZoomDisabled, setZoomDisabled } from '../../utils/zoomLock'
import { openPageSearch } from '../common/CommandPalette'
import ActionSheet, { type ActionSheetAction } from '../common/ActionSheet'
import BottomSheet from '../common/BottomSheet'
import Switch from '../common/Switch'
import RoleBadge from '../common/RoleBadge'
import CreateWorkspaceForm from './CreateWorkspaceForm'
import LanguageMenu from './LanguageMenu'
import ThemeToggleRow from './ThemeToggleRow'
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel'
import TransactionFormModal from '../modals/transactions/TransactionFormModal'
import PlannedFormModal from '../modals/transactions/PlannedFormModal'
import TransferModal from '../accounts/TransferModal'
import type { ParsedReceipt } from '../../types'

// Overflow destinations live in the More sheet (plan decision 5).
// Keys only: t() is resolved at render time inside the component (a
// module-level t() call would freeze the language at load time).
const MORE_DESTINATIONS = [
  { to: '/accounts', labelKey: 'accounts', icon: Wallet },
  { to: '/planned', labelKey: 'planned', icon: Calendar },
  { to: '/members', labelKey: 'members', icon: Users },
  { to: '/settings', labelKey: 'settings', icon: Settings },
] as const

// Mirrors the accept list in TransactionFormModal's inline receipt upload.
const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

interface TabProps {
  to: string
  label: string
  icon: LucideIcon
  exact?: boolean
}

// components.md §19: 20px icons, 10px uppercase labels, active = text-primary.
function Tab({ to, label, icon: Icon, exact = false }: TabProps) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        `flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 min-h-[44px] transition-colors ${
          isActive ? 'text-primary' : 'text-text-muted'
        }`
      }
    >
      <Icon size={20} strokeWidth={1.5} />
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </NavLink>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted truncate">
      {children}
    </div>
  )
}

const moreRowClass =
  'w-full min-h-[44px] px-4 flex items-center gap-3 text-sm text-left text-text transition-colors active:bg-surface-hover disabled:opacity-50'

/**
 * Mobile navigation shell (M4): bottom bar per components.md §19 with a
 * center quick-add FAB, plus the More sheet housing overflow destinations
 * and the workspace/user controls the sidebar provides on desktop.
 */
export default function BottomNav() {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const { user, logout } = useAuth()
  const { workspace, workspaces } = useWorkspace()
  const { switchingToId, switchTo } = useWorkspaceSwitch()
  const { canWrite } = usePermissions()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()

  const [moreOpen, setMoreOpen] = useState(false)
  // Mirrors the stored zoom preference (utils/zoomLock) for the Switch.
  const [zoomLocked, setZoomLocked] = useState(isZoomDisabled)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false)

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  // Receipt-first flow: the parent owns the file picker + parse, then seeds the
  // canonical TransactionFormModal via `prefillReceipt`. Set exactly once per
  // flow (on parse success) and cleared to null in the modal's onClose wrapper,
  // so the reference is stable while the modal is open — no mid-edit re-seed.
  const [prefillReceipt, setPrefillReceipt] = useState<{ file: File; parsed: ParsedReceipt } | null>(null)
  const [plannedOpen, setPlannedOpen] = useState(false)

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
    // parse.mutate, so clearing the input value is safe (CODING_SUMMARIES T4-fix).
    if (receiptFileRef.current) receiptFileRef.current.value = ''
  }

  // Close the More sheet when navigation happens from inside it; the create
  // modal follows suit so no form outlives the page it was opened on.
  useEffect(() => {
    setMoreOpen(false)
    setCreateWorkspaceOpen(false)
  }, [location.pathname])

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
  ]

  const moreActive = MORE_DESTINATIONS.some((d) => location.pathname.startsWith(d.to))

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-bottom-nav bg-surface border-t border-border flex items-end pb-safe">
        <Tab to="/" label={t('home')} icon={Home} exact />
        <Tab to="/transactions" label={t('txns')} icon={Receipt} />

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

        <Tab to="/budgets" label={t('budgets')} icon={PieChart} />

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 min-h-[44px] transition-colors ${
            moreActive ? 'text-primary' : 'text-text-muted'
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={1.5} />
          <span className="text-[10px] font-medium uppercase tracking-wider">{t('more')}</span>
        </button>
      </nav>

      {/* More sheet: overflow destinations + workspace + user controls */}
      <BottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        aria-label={t('more')}
      >
        <div className="pb-2">
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false)
              openPageSearch()
            }}
            className={moreRowClass}
          >
            <Search size={16} strokeWidth={1.5} className="flex-shrink-0" />
            {t('search')}
          </button>
          {MORE_DESTINATIONS.map((d) => (
            <NavLink
              key={d.to}
              to={d.to}
              className={({ isActive }) =>
                `${moreRowClass} ${isActive ? 'font-medium bg-surface-hover' : ''}`
              }
            >
              <d.icon size={16} strokeWidth={1.5} className="flex-shrink-0" />
              {t(d.labelKey)}
            </NavLink>
          ))}
          {/* Logout lives mid-sheet (below Settings), NOT as the bottom row:
              the bottom row sits right where the thumb tapped "More" and was
              collecting accidental logouts. */}
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false)
              logout()
            }}
            className={moreRowClass}
          >
            <LogOut size={16} strokeWidth={1.5} className="flex-shrink-0" />
            {t('logout')}
          </button>

          <div className="border-t border-border mt-2">
            <SectionLabel>{t('workspace')}</SectionLabel>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => switchTo(ws, () => setMoreOpen(false))}
                disabled={switchingToId !== null}
                className={moreRowClass}
              >
                {ws.id === workspace?.id ? (
                  <Check size={16} className="text-primary flex-shrink-0" />
                ) : switchingToId === ws.id ? (
                  <Loader2 size={16} className="animate-spin flex-shrink-0" />
                ) : (
                  <span className="w-4 flex-shrink-0" />
                )}
                <span className="truncate flex-1">{ws.name}</span>
                <RoleBadge role={ws.user_role} />
              </button>
            ))}
            {/* Closes the sheet before opening the create modal, so the modal
                is the only overlay layer (one Escape press, one dismissal). */}
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                setCreateWorkspaceOpen(true)
              }}
              className={moreRowClass}
            >
              <Plus size={16} className="flex-shrink-0" />
              {t('createWorkspace')}
            </button>
            {workspace && (
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  setWorkspaceSettingsOpen(true)
                }}
                className={moreRowClass}
              >
                <Landmark size={16} className="flex-shrink-0" />
                {t('workspaceSettings')}
              </button>
            )}
          </div>

          <div className="border-t border-border mt-2">
            <SectionLabel>{user?.full_name || user?.email}</SectionLabel>
            {/* PWA has no browser chrome to refresh with. */}
            <button type="button" onClick={() => window.location.reload()} className={moreRowClass}>
              <RotateCw size={16} strokeWidth={1.5} className="flex-shrink-0" />
              {t('reload')}
            </button>
            <ThemeToggleRow />
            <LanguageMenu />
            <div className="flex items-center justify-between min-h-[44px] px-4">
              <span className="flex items-center gap-3 text-sm text-text">
                <ZoomIn size={16} strokeWidth={1.5} className="flex-shrink-0" />
                {t('disableZoom')}
              </span>
              <Switch
                checked={zoomLocked}
                onChange={() => {
                  const next = !zoomLocked
                  setZoomLocked(next)
                  setZoomDisabled(next)
                }}
                aria-label={t('disableZoom')}
              />
            </div>
            {/* Logout's old slot (the double-tap misclick zone): only the
                left-side Close button is interactive - the rest of the row
                deliberately does nothing, so a stray tap can't trigger
                anything. Do NOT stretch the button to the full row. */}
            <div className="flex items-center min-h-[44px] px-4">
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 min-h-[44px] pr-4 text-sm text-text transition-colors active:bg-surface-hover"
              >
                <X size={16} strokeWidth={1.5} className="flex-shrink-0" />
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* FAB quick-add (plan decision 6) — owned here so it works on any route */}
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
      {/* Create-workspace modal (mount-per-use): the More sheet's trigger row
          closes the sheet first, so this is the only overlay layer while open. */}
      {createWorkspaceOpen && (
        <CreateWorkspaceForm onClose={() => setCreateWorkspaceOpen(false)} />
      )}

      {/* Receipt-first picker — always mounted so .click() works in the gesture. */}
      <input
        ref={receiptFileRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        onChange={handleReceiptFile}
        className="hidden"
      />

      {workspace && (
        <WorkspaceSettingsPanel
          isOpen={workspaceSettingsOpen}
          onClose={() => setWorkspaceSettingsOpen(false)}
        />
      )}
    </>
  )
}
