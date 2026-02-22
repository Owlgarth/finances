import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useBudgetPeriod } from '../../contexts/BudgetPeriodContext'
import { useLayout } from '../../contexts/LayoutContext'
import BudgetAccountSelector from '../BudgetAccountSelector'
import BudgetPeriodSelectorModal from '../modals/periods/BudgetPeriodSelectorModal'
import UserMenu from './UserMenu'
import {
  HiHome,
  HiCurrencyDollar,
  HiCalendar,
  HiSwitchHorizontal,
  HiTag,
  HiClock,
  HiBriefcase,
  HiUserGroup,
  HiChevronLeft,
  HiChevronRight,
  HiViewGrid,
  HiViewList,
} from 'react-icons/hi'

const navItems = [
  { to: '/', label: 'Dashboard', icon: HiHome, exact: true },
  { to: '/transactions', label: 'Transactions', icon: HiCurrencyDollar },
  { to: '/planned', label: 'Planned', icon: HiCalendar },
  { to: '/exchanges', label: 'Exchanges', icon: HiSwitchHorizontal },
  { to: '/categories', label: 'Categories', icon: HiTag },
  { to: '/budget-periods', label: 'Periods', icon: HiClock },
  { to: '/budget-accounts', label: 'Accounts', icon: HiBriefcase },
  { to: '/members', label: 'Members', icon: HiUserGroup },
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
      <span className="text-sm text-gray-500 px-3 py-1.5">
        No periods
      </span>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors">
        <div className="px-3 py-1.5 flex items-center gap-2 flex-1 min-w-0">
          <HiCalendar className="h-4 w-4 text-gray-600 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 truncate">
            {selectedPeriod?.name || 'Select period'}
          </span>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-2 py-1.5 hover:bg-gray-100 rounded-r-lg transition-colors border-l border-gray-200"
          aria-label="Change budget period"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-gray-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
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
      className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors text-sm"
      title={layoutMode === 'cards' ? 'Switch to auto layout' : 'Switch to cards layout'}
    >
      {layoutMode === 'cards' ? (
        <HiViewList className="h-5 w-5 flex-shrink-0" />
      ) : (
        <HiViewGrid className="h-5 w-5 flex-shrink-0" />
      )}
      <span>Layout: {layoutMode === 'cards' ? 'Cards' : 'Auto'}</span>
    </button>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  onClose?: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse, onClose }: SidebarProps) {
  return (
    <aside
      className={`flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-200
        ${collapsed ? 'w-16' : 'w-64'}`}
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        {!collapsed && (
          <span className="text-xl font-bold text-gray-900">Monie</span>
        )}
        <button
          onClick={onClose ?? onToggleCollapse}
          className={`p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors
            ${collapsed ? 'mx-auto' : ''}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <HiChevronRight className="h-5 w-5" />
          ) : (
            <HiChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Account & Period selectors */}
      {!collapsed && (
        <div className="p-3 space-y-2 border-b border-gray-200 flex-shrink-0">
          <BudgetAccountSelector />
          <NavigationPeriodSelector collapsed={collapsed} />
        </div>
      )}

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto p-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors mb-0.5
              ${isActive
                ? 'bg-gray-100 text-gray-900 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Bottom: layout toggle + user menu */}
      <div className="p-2 border-t border-gray-200 flex-shrink-0 space-y-1">
        <LayoutToggle collapsed={collapsed} />
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  )
}
