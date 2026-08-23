import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { UserPreferencesProvider } from './contexts/UserPreferencesContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/Dashboard'
import AccountsPage from './pages/AccountsPage'
import BudgetsPage from './pages/BudgetsPage'
import BudgetDetailPage from './pages/BudgetDetailPage'
import BudgetPeriodsPage from './pages/BudgetPeriodsPage'
import Transactions from './pages/Transactions'
import Planned from './pages/Planned'
import ProfilePage from './pages/ProfilePage'
import Login from './pages/Login'
import Register from './pages/Register'
import WorkspaceMembersPage from './pages/WorkspaceMembersPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsPage from './pages/TermsPage'
import ReConsentPage from './pages/ReConsentPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import ConfirmEmailChangePage from './pages/ConfirmEmailChangePage'
import NotFoundPage from './pages/NotFoundPage'

function AppContent() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/budgets/:id" element={<BudgetDetailPage />} />
        <Route path="/budgets/:id/periods" element={<BudgetPeriodsPage />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/planned" element={<Planned />} />
        <Route path="/members" element={<WorkspaceMembersPage />} />
        <Route path="/settings" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MainLayout>
  )
}

function ProtectedApp() {
  return (
    <ProtectedRoute>
      <WorkspaceProvider>
        <UserPreferencesProvider>
          <AppContent />
        </UserPreferencesProvider>
      </WorkspaceProvider>
    </ProtectedRoute>
  )
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/reconsent" element={<ProtectedRoute><ReConsentPage /></ProtectedRoute>} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {/* Requires auth: email change token is validated against the logged-in user's ID.
              Users opening the link in a new session must log in first, then re-click the link. */}
          <Route path="/confirm-email-change" element={<ProtectedRoute><ConfirmEmailChangePage /></ProtectedRoute>} />

          {/* Protected routes */}
          <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
