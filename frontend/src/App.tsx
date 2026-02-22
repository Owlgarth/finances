import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { BudgetPeriodProvider } from './contexts/BudgetPeriodContext'
import { BudgetAccountProvider } from './contexts/BudgetAccountContext'
import { LayoutProvider } from './contexts/LayoutContext'
import { AuthProvider } from './contexts/AuthContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/layout/MainLayout'
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

function AppContent() {
  return (
    <MainLayout>
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
    </MainLayout>
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
