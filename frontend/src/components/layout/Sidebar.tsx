import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Home,
  PieChart,
  Receipt,
  Search,
  Wallet,
  Users,
} from 'lucide-react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { isMacLike, openPageSearch } from '../common/CommandPalette'
import UserMenu from './UserMenu'
import WorkspaceSelector from './WorkspaceSelector'
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Home, exact: true },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/budgets', label: 'Budgets', icon: PieChart },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/planned', label: 'Planned', icon: Calendar },
  { to: '/members', label: 'Members', icon: Users },
]

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { workspace } = useWorkspace()

  const handleOpenSettings = () => setIsSettingsOpen(true)

  return (
    <>
      <aside
        className={`flex flex-col h-full bg-surface border-r border-border transition-all duration-200 z-50
          ${collapsed ? 'w-14' : 'w-60'}`}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between p-4 flex-shrink-0 mb-4">
          {!collapsed && (
            <span className="font-sans font-semibold text-primary text-base tracking-tight select-none whitespace-nowrap">Owlgarth Finances</span>
          )}
          <button
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors
              ${collapsed ? 'mx-auto' : ''}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Workspace selector — icon-only in the collapsed rail (responsive.md tablet spec) */}
        <div className={`flex-shrink-0 mt-3 ${collapsed ? 'p-2' : 'p-3 space-y-3'}`}>
          <WorkspaceSelector onOpenSettings={handleOpenSettings} collapsed={collapsed} />
        </div>

        {/* Nav links */}
        {workspace ? (
          <nav className="flex-1 overflow-y-auto p-2">
            <button
              type="button"
              onClick={openPageSearch}
              title={collapsed ? 'Search' : undefined}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-sm transition-colors mb-1 text-text-muted hover:bg-surface-hover hover:text-text"
            >
              <Search size={14} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="font-mono text-xs uppercase tracking-wider flex-1 text-left">Search</span>
                  <kbd className="text-[10px] font-mono border border-border rounded-sm px-1 py-0.5 text-text-muted">
                    {isMacLike ? '⌘K' : 'Ctrl K'}
                  </kbd>
                </>
              )}
            </button>
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
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
