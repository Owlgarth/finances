import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useBudgetPeriod } from '../../contexts/BudgetPeriodContext'
import { useLayout } from '../../contexts/LayoutContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import BudgetAccountSelector from '../BudgetAccountSelector'
import BudgetPeriodSelectorModal from '../modals/periods/BudgetPeriodSelectorModal'
import UserMenu from './UserMenu'
import WorkspaceSelector from './WorkspaceSelector'
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel'

const navItems = [
  { to: '/', label: 'Dashboard', icon: 'home', exact: true },
  { to: '/transactions', label: 'Transactions', icon: 'payments' },
  { to: '/planned', label: 'Planned', icon: 'today' },
  { to: '/exchanges', label: 'Exchanges', icon: 'currency_exchange' },
  { to: '/categories', label: 'Categories', icon: 'label' },
  { to: '/budget-periods', label: 'Periods', icon: 'schedule' },
  { to: '/budget-accounts', label: 'Accounts', icon: 'account_balance' },
  { to: '/members', label: 'Members', icon: 'group' },
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
      <span className="text-sm text-on-surface-variant px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider">
        No periods
      </span>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 bg-surface-container-highest rounded-lg hover:bg-surface-container-high transition-colors">
        <div className="px-3 py-1.5 flex items-center gap-2 flex-1 min-w-0">
          <span className="material-symbols-outlined text-base text-on-surface-variant flex-shrink-0 select-none">today</span>
          <span className="text-sm font-medium text-on-surface truncate">
            {selectedPeriod?.name || 'Select period'}
          </span>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-2 py-1.5 hover:bg-surface-container transition-colors rounded-r-lg flex items-center justify-center"
          aria-label="Change budget period"
        >
          <span className="material-symbols-outlined text-base text-on-surface-variant select-none">expand_more</span>
        </button>
      </div>
      <BudgetPeriodSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}

function LayoutToggle({ collapsed }: { collapsed: boolean }) {
  const { layoutMode, setLayoutMode } = useLayout()

  if (collapsed) return null

  return (
    <button
      onClick={() => setLayoutMode(layoutMode === 'auto' ? 'cards' : 'auto')}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-on-surface/70 hover:bg-white/50 hover:text-primary transition-all text-sm group"
      title={layoutMode === 'cards' ? 'Switch to auto layout' : 'Switch to cards layout'}
    >
      <span className="material-symbols-outlined text-xl flex-shrink-0 select-none">
        {layoutMode === 'cards' ? 'view_list' : 'grid_view'}
      </span>
      <span className="font-['JetBrains_Mono'] text-xs uppercase tracking-wider">
        Layout: {layoutMode === 'cards' ? 'Cards' : 'Auto'}
      </span>
    </button>
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
        className={`flex flex-col h-full bg-surface-container-low transition-all duration-300 z-50
          ${collapsed ? 'w-16' : 'w-60'}`}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between p-4 flex-shrink-0 mb-4">
          {!collapsed && (
            <span className="font-headline font-black text-primary text-2xl tracking-tight select-none">Monie</span>
          )}
          <button
            onClick={onClose ?? onToggleCollapse}
            className={`p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-white/50 transition-colors
              ${collapsed ? 'mx-auto' : ''}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="material-symbols-outlined select-none">
              {collapsed ? 'chevron_right' : 'chevron_left'}
            </span>
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
                  `flex items-center gap-3 px-3 py-2 rounded-lg transition-all mb-1 group
                  ${isActive
                    ? 'bg-white shadow-sm text-primary font-bold translate-x-1'
                    : 'text-on-surface/70 hover:bg-white/50 hover:text-primary'
                  }`
                }
                title={collapsed ? item.label : undefined}
              >
                <span className="material-symbols-outlined text-xl flex-shrink-0 select-none">
                  {item.icon}
                </span>
                {!collapsed && (
                  <span className="font-['JetBrains_Mono'] text-xs uppercase tracking-wider">
                    {item.label}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <p className="text-sm text-on-surface-variant mb-2">No workspace selected</p>
              <p className="text-xs text-on-surface-variant/70">
                Create or join a workspace to get started
              </p>
            </div>
          </div>
        )}

        {/* Bottom: layout toggle + user menu */}
        <div className="p-2 flex-shrink-0 space-y-1 py-3 mt-3">
          <LayoutToggle collapsed={collapsed} />
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
