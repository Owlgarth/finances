import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { BudgetPeriodProvider, useBudgetPeriod } from './contexts/BudgetPeriodContext'
import { BudgetAccountProvider } from './contexts/BudgetAccountContext'
import { LayoutProvider, useLayout } from './contexts/LayoutContext'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import ProtectedRoute from './components/ProtectedRoute'
import BudgetAccountSelector from './components/BudgetAccountSelector'
import BudgetPeriodSelectorModal from './components/modals/periods/BudgetPeriodSelectorModal'
import Dashboard from './pages/Dashboard'
import BudgetPeriod from './pages/BudgetPeriod'
import Transactions from './pages/Transactions'
import Planned from './pages/Planned'
import BudgetPeriodsPage from './pages/BudgetPeriodsPage'
import BudgetAccountsPage from './pages/BudgetAccountsPage'
import CategoryPage from './pages/CategoryPage'
import CurrencyExchangesPage from './pages/CurrencyExchangesPage'
import ProfilePage from './pages/ProfilePage'
import Login from './pages/Login'
import Register from './pages/Register'
import WorkspaceMembersPage from './pages/WorkspaceMembersPage'
import { OfflineIndicator } from './components/common/OfflineIndicator'
import { HiViewGrid, HiViewList, HiLogout, HiUser, HiArrowsExpand, HiCalendar } from 'react-icons/hi'

function NavigationPeriodSelector() {
  const location = useLocation()
  const { selectedPeriod, periods } = useBudgetPeriod()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Don't show on Budget Periods page or Budget Accounts page
  if (location.pathname === '/budget-periods' || location.pathname === '/budget-accounts') {
    return null
  }

  if (periods.length === 0) {
    return (
      <span className="text-sm text-gray-500 px-3 py-1.5">
        No periods
      </span>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors w-full md:w-auto">
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

function LayoutToggle() {
  const { layoutMode, setLayoutMode } = useLayout()

  return (
    <button
      onClick={() => setLayoutMode(layoutMode === 'auto' ? 'cards' : 'auto')}
      className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      title={layoutMode === 'cards' ? 'Switch to auto layout' : 'Switch to cards layout'}
    >
      {layoutMode === 'cards' ? (
        <HiViewList className="h-5 w-5" />
      ) : (
        <HiViewGrid className="h-5 w-5" />
      )}
    </button>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
      >
        <HiUser className="h-5 w-5" />
        <span className="hidden sm:inline text-sm font-medium truncate max-w-32">
          {user?.full_name || user?.email}
        </span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20 border border-gray-200">
            <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
              {user?.email}
            </div>
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/profile')
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <HiUser className="h-4 w-4" />
              Profile
            </button>
            <button
              onClick={async () => {
                setIsOpen(false)
                await logout()
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <HiLogout className="h-4 w-4" />
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// Navigation items configuration
const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/exchanges', label: 'Exchanges' },
  { to: '/planned', label: 'Planned' },
  { to: '/categories', label: 'Categories' },
  { to: '/budget-periods', label: 'Periods' },
  { to: '/budget-accounts', label: 'Accounts' },
  { to: '/members', label: 'Members' },
]

function NavGridButton({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-center font-medium text-gray-700 hover:text-gray-900 transition-colors"
    >
      {label}
    </Link>
  )
}

function PagesPanel() {
  return (
    <div className="mt-4 pt-4 border-t border-gray-200 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {navItems.map((item) => (
          <NavGridButton key={item.to} to={item.to} label={item.label} />
        ))}
      </div>
    </div>
  )
}

const MENU_OPEN_STORAGE_KEY = 'monie-menu-open'

function AppContent() {
  // Initialize menu state from localStorage, defaulting to true (opened)
  const [pagesMenuOpen, setPagesMenuOpenState] = useState(() => {
    const stored = localStorage.getItem(MENU_OPEN_STORAGE_KEY)
    // Default to true (open) if no preference is saved
    return stored !== null ? stored === 'true' : true
  })

  // Wrapper to persist menu state changes to localStorage
  const setPagesMenuOpen = (value: boolean) => {
    setPagesMenuOpenState(value)
    localStorage.setItem(MENU_OPEN_STORAGE_KEY, String(value))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-5">
          {/* Mobile layout: stacked rows */}
          <div className="flex flex-col gap-3 sm:hidden">
            <BudgetAccountSelector />
            <NavigationPeriodSelector />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPagesMenuOpen(!pagesMenuOpen)}
                className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out flex items-center gap-2"
                aria-expanded={pagesMenuOpen}
                aria-label="Toggle navigation menu"
              >
                <HiArrowsExpand className="h-5 w-5 text-gray-600" />
              </button>
              <UserMenu />
            </div>
          </div>

          {/* Desktop layout: single row */}
          <div className="hidden sm:flex sm:items-center sm:justify-between">
            {/* Left side: Selectors */}
            <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
              <BudgetAccountSelector />
              <NavigationPeriodSelector />
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Navigation toggle button */}
              <button
                onClick={() => setPagesMenuOpen(!pagesMenuOpen)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all duration-200 ease-in-out flex items-center gap-2"
                aria-expanded={pagesMenuOpen}
                aria-label="Toggle navigation menu"
              >
                <HiArrowsExpand className="h-5 w-5 text-gray-600" />
              </button>
              <LayoutToggle />
              <UserMenu />
            </div>
          </div>

          {/* Collapsible Pages Grid (below nav row) */}
          {pagesMenuOpen && (
            <PagesPanel />
          )}
        </div>
      </nav>

      <main className="w-full px-4 sm:px-8 py-8 sm:py-12">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/period/:id" element={<BudgetPeriod />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/exchanges" element={<CurrencyExchangesPage />} />
          <Route path="/planned" element={<Planned />} />
          <Route path="/categories" element={<CategoryPage />} />
          <Route path="/budget-periods" element={<BudgetPeriodsPage />} />
          <Route path="/budget-accounts" element={<BudgetAccountsPage />} />
          <Route path="/members" element={<WorkspaceMembersPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>
      </main>

      {/* Offline mode indicator */}
      <OfflineIndicator />
    </div>
  )
}

function ProtectedApp() {
  return (
    <ProtectedRoute>
      <WorkspaceProvider>
        <LayoutProvider>
          <BudgetAccountProvider>
            <BudgetPeriodProvider>
              <AppContent />
            </BudgetPeriodProvider>
          </BudgetAccountProvider>
        </LayoutProvider>
      </WorkspaceProvider>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
