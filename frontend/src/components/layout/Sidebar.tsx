import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Receipt,
  ArrowLeftRight,
  Tag,
  Landmark,
  Users,
} from 'lucide-react'
import { useBudgetPeriod } from '../../contexts/BudgetPeriodContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import BudgetAccountSelector from '../BudgetAccountSelector'
import BudgetPeriodSelectorModal from '../modals/periods/BudgetPeriodSelectorModal'
import UserMenu from './UserMenu'
import WorkspaceSelector from './WorkspaceSelector'
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home, exact: true },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/planned', label: 'Planned', icon: Calendar },
  { to: '/exchanges', label: 'Exchanges', icon: ArrowLeftRight },
  { to: '/categories', label: 'Categories', icon: Tag },
  { to: '/budget-periods', label: 'Periods', icon: Calendar },
  { to: '/budget-accounts', label: 'Accounts', icon: Landmark },
  { to: '/members', label: 'Members', icon: Users },
]

function NavigationPeriodSelector({ collapsed }: { collapsed: boolean }) {
  const location = useLocation()
  const { selectedPeriod, periods } = useBudgetPeriod()
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (location.pathname === '/budget-periods' || location.pathname === '/budget-accounts') {
    return null
  }

  if (collapsed) return null

  if (periods.length === 0) {
    return (
      <span className="text-sm text-text-muted px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider">
        No periods
      </span>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 bg-surface-muted rounded-sm hover:bg-surface-hover transition-colors">
        <div className="px-3 py-1.5 flex items-center gap-2 flex-1 min-w-0">
          <Calendar size={14} className="text-text-muted flex-shrink-0" />
          <span className="text-sm font-medium text-text truncate">
            {selectedPeriod?.name || 'Select period'}
          </span>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-2 py-1.5 hover:bg-surface-hover transition-colors rounded-r-sm flex items-center justify-center"
          aria-label="Change budget period"
        >
          <ChevronDown size={12} className="text-text-muted" />
        </button>
      </div>
      <BudgetPeriodSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  onClose?: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse, onClose }: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { workspace } = useWorkspace()

  const handleOpenSettings = () => setIsSettingsOpen(true)

  return (
    <>
      <aside
        className={`flex flex-col h-full bg-surface border-r border-border transition-all duration-300 z-50
          ${collapsed ? 'w-16' : 'w-60'}`}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between p-4 flex-shrink-0 mb-4">
          {!collapsed && (
            <span className="font-sans font-semibold text-primary text-base tracking-tight select-none">Denarly</span>
          )}
          <button
            onClick={onClose ?? onToggleCollapse}
            className={`p-1.5 rounded-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors
              ${collapsed ? 'mx-auto' : ''}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Workspace, Account & Period selectors */}
        {!collapsed && (
          <div className="p-3 space-y-3 flex-shrink-0 mt-3">
            <WorkspaceSelector onOpenSettings={handleOpenSettings} />
            {workspace && (
              <>
                <BudgetAccountSelector />
                <NavigationPeriodSelector collapsed={collapsed} />
              </>
            )}
          </div>
        )}

        {/* Nav links */}
        {workspace ? (
          <nav className="flex-1 overflow-y-auto p-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-sm transition-colors mb-1 group
                  ${isActive
                    ? 'bg-surface-hover border-l-2 border-primary text-text font-medium'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text'
                  }`
                }
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={14} className="flex-shrink-0" />
                {!collapsed && (
                  <span className="font-mono text-xs uppercase tracking-wider">
                    {item.label}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <p className="text-sm text-text-muted mb-2">No workspace selected</p>
              <p className="text-xs text-text-muted">
                Create or join a workspace to get started
              </p>
            </div>
          </div>
        )}

        {/* Bottom: user menu */}
        <div className="p-2 flex-shrink-0 space-y-1 py-3 mt-3">
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>

      {workspace && (
        <WorkspaceSettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </>
  )
}
