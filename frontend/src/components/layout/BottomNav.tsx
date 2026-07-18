import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  ArrowLeftRight,
  Calendar,
  Check,
  Home,
  Landmark,
  Loader2,
  LogOut,
  Moon,
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
  ZoomIn,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useExtractionEnabled } from '../../hooks/useDomain'
import { getApiErrorMessage } from '../../utils/errors'
import { isZoomDisabled, setZoomDisabled } from '../../utils/zoomLock'
import { openPageSearch } from '../common/CommandPalette'
import ActionSheet, { type ActionSheetAction } from '../common/ActionSheet'
import BottomSheet from '../common/BottomSheet'
import Switch from '../common/Switch'
import CreateWorkspaceForm from './CreateWorkspaceForm'
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel'
import TransactionFormModal from '../modals/transactions/TransactionFormModal'
import NewFromReceiptModal from '../modals/transactions/NewFromReceiptModal'
import PlannedFormModal from '../modals/transactions/PlannedFormModal'
import TransferModal from '../accounts/TransferModal'
import type { Workspace } from '../../types'

// Overflow destinations live in the More sheet (plan decision 5).
const MORE_DESTINATIONS = [
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/planned', label: 'Planned', icon: Calendar },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
]

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
  const location = useLocation()
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const { workspace, workspaces, switchWorkspace } = useWorkspace()
  const { canWrite } = usePermissions()
  const extractionEnabled = useExtractionEnabled()

  const [moreOpen, setMoreOpen] = useState(false)
  // Mirrors the stored zoom preference (utils/zoomLock) for the Switch.
  const [zoomLocked, setZoomLocked] = useState(isZoomDisabled)
  const [creatingWorkspace, setCreatingWorkspace] = useState(false)
  const [switchingToId, setSwitchingToId] = useState<number | null>(null)
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false)

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [transactionOpen, setTransactionOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [plannedOpen, setPlannedOpen] = useState(false)

  // Close the More sheet when navigation happens from inside it.
  useEffect(() => {
    setMoreOpen(false)
    setCreatingWorkspace(false)
  }, [location.pathname])

  const handleSwitch = async (ws: Workspace) => {
    if (ws.id === workspace?.id) {
      setMoreOpen(false)
      return
    }
    setSwitchingToId(ws.id)
    try {
      await switchWorkspace(ws.id)
      setMoreOpen(false)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to switch workspace'))
    } finally {
      setSwitchingToId(null)
    }
  }

  const quickAddActions: ActionSheetAction[] = [
    { label: 'New transaction', icon: Receipt, onSelect: () => setTransactionOpen(true) },
    { label: 'Transfer', icon: ArrowLeftRight, onSelect: () => setTransferOpen(true) },
    ...(extractionEnabled
      ? [{ label: 'From receipt', icon: ScanLine, onSelect: () => setReceiptOpen(true) }]
      : []),
    { label: 'Planned transaction', icon: Calendar, onSelect: () => setPlannedOpen(true) },
  ]

  const moreActive = MORE_DESTINATIONS.some((d) => location.pathname.startsWith(d.to))

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-bottom-nav bg-surface border-t border-border flex items-end pb-safe">
        <Tab to="/" label="Home" icon={Home} exact />
        <Tab to="/transactions" label="Txns" icon={Receipt} />

        {/* Center FAB slot — kept even when the FAB is hidden (viewer role /
            no workspace) so the four tabs don't shift. */}
        <div className="flex-1 flex flex-col items-center">
          {workspace && canWrite && (
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              aria-label="Add record"
              className="-mt-5 w-12 h-12 bg-primary border border-border rounded-sm flex items-center justify-center text-background hover:bg-primary-hover active:scale-95 transition-all"
            >
              <Plus size={20} strokeWidth={1.5} />
            </button>
          )}
        </div>

        <Tab to="/budgets" label="Budgets" icon={PieChart} />

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 min-h-[44px] transition-colors ${
            moreActive ? 'text-primary' : 'text-text-muted'
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={1.5} />
          <span className="text-[10px] font-medium uppercase tracking-wider">More</span>
        </button>
      </nav>

      {/* More sheet: overflow destinations + workspace + user controls */}
      <BottomSheet
        open={moreOpen}
        onClose={() => {
          setMoreOpen(false)
          setCreatingWorkspace(false)
        }}
        aria-label="More"
      >
        {creatingWorkspace ? (
          <div className="p-4">
            <CreateWorkspaceForm
              compact
              onCancel={() => setCreatingWorkspace(false)}
              onCreated={() => {
                setCreatingWorkspace(false)
                setMoreOpen(false)
              }}
            />
          </div>
        ) : (
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
              Search
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
                {d.label}
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
              Logout
            </button>

            <div className="border-t border-border mt-2">
              <SectionLabel>Workspace</SectionLabel>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => handleSwitch(ws)}
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
                  {ws.user_role && (
                    <span className="text-xs px-1.5 py-0.5 rounded-sm bg-surface-muted text-text-muted">
                      {ws.user_role}
                    </span>
                  )}
                </button>
              ))}
              <button type="button" onClick={() => setCreatingWorkspace(true)} className={moreRowClass}>
                <Plus size={16} className="flex-shrink-0" />
                Create workspace
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
                  Workspace settings
                </button>
              )}
            </div>

            <div className="border-t border-border mt-2">
              <SectionLabel>{user?.full_name || user?.email}</SectionLabel>
              {/* PWA has no browser chrome to refresh with. */}
              <button type="button" onClick={() => window.location.reload()} className={moreRowClass}>
                <RotateCw size={16} strokeWidth={1.5} className="flex-shrink-0" />
                Reload
              </button>
              <div className="flex items-center justify-between min-h-[44px] px-4">
                <span className="flex items-center gap-3 text-sm text-text">
                  <Moon size={16} strokeWidth={1.5} className="flex-shrink-0" />
                  Dark mode
                </span>
                <Switch checked={isDark} onChange={() => toggleTheme()} aria-label="Dark mode" />
              </div>
              <div className="flex items-center justify-between min-h-[44px] px-4">
                <span className="flex items-center gap-3 text-sm text-text">
                  <ZoomIn size={16} strokeWidth={1.5} className="flex-shrink-0" />
                  Disable zoom
                </span>
                <Switch
                  checked={zoomLocked}
                  onChange={() => {
                    const next = !zoomLocked
                    setZoomLocked(next)
                    setZoomDisabled(next)
                  }}
                  aria-label="Disable zoom"
                />
              </div>
              {/* Inert spacer in Logout's old slot: absorbs the double-tap
                  misclick after opening the sheet, and keeps Dark mode /
                  Disable zoom from sliding down into that zone. */}
              <div aria-hidden="true" className="min-h-[44px]" />
            </div>
          </div>
        )}
      </BottomSheet>

      {/* FAB quick-add (plan decision 6) — owned here so it works on any route */}
      <ActionSheet
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        actions={quickAddActions}
      />
      <TransactionFormModal open={transactionOpen} onClose={() => setTransactionOpen(false)} />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
      <NewFromReceiptModal open={receiptOpen} onClose={() => setReceiptOpen(false)} />
      <PlannedFormModal open={plannedOpen} onClose={() => setPlannedOpen(false)} />

      {workspace && (
        <WorkspaceSettingsPanel
          isOpen={workspaceSettingsOpen}
          onClose={() => setWorkspaceSettingsOpen(false)}
        />
      )}
    </>
  )
}
