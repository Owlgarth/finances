import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { LanguageProvider } from './i18n/LanguageContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { UserPreferencesProvider } from './contexts/UserPreferencesContext'
import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/layout/MainLayout'
import Dashboard from './pages/Dashboard'
import AccountsPage from './pages/AccountsPage'
import AccountPage from './pages/AccountPage'
import BookmarksPage from './pages/BookmarksPage'
import BudgetsPage from './pages/BudgetsPage'
import BudgetDetailPage from './pages/BudgetDetailPage'
import BudgetPeriodsPage from './pages/BudgetPeriodsPage'
import Transactions from './pages/Transactions'
import TransactionRecordPage from './pages/TransactionRecordPage'
import Planned from './pages/Planned'
import PlannedRecordPage from './pages/PlannedRecordPage'
import RecurringRulePage from './pages/RecurringRulePage'
import TransfersPage from './pages/TransfersPage'
import TransferRecordPage from './pages/TransferRecordPage'
import NewTransactionPage from './pages/NewTransactionPage'
import NewPlannedPage from './pages/NewPlannedPage'
import PayPlannedPage from './pages/PayPlannedPage'
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
import { useBreakpoint } from './hooks/useBreakpoint'

/** The record route's host follows the tier: at 1024+ the list page hosts
 *  the record in its side panel (it reads :id itself, so both routes
 *  render <Transactions />), below 1024 the record is a full page. */
function TransactionRecordRoute() {
  const { isDesktop } = useBreakpoint()
  return isDesktop ? <Transactions /> : <TransactionRecordPage />
}

/** Same tier split for transfers: at 1024+ the transfers list hosts the
 *  record in its side panel, below 1024 the record is a full page. */
function TransferRecordRoute() {
  const { isDesktop } = useBreakpoint()
  return isDesktop ? <TransfersPage /> : <TransferRecordPage />
}

/** The planned item's record follows the tier like the transaction record:
 *  at 1024+ the list page hosts the record in its side panel (it reads the
 *  path itself, so the list route and the record route both render
 *  <Planned />), below 1024 the record is a full page. */
function PlannedRecordRoute() {
  const { isDesktop } = useBreakpoint()
  return isDesktop ? <Planned /> : <PlannedRecordPage />
}

/** The same tier split for "Paid differently": at 1024+ the list page hosts
 *  the pay form in its side panel, below 1024 it is a full page. */
function PlannedPayRoute() {
  const { isDesktop } = useBreakpoint()
  return isDesktop ? <Planned /> : <PayPlannedPage />
}

/** The same tier split for the planned create form: at 1024+ the list page
 *  hosts the form in its side panel (the list reads the path itself, so the
 *  create route renders <Planned /> there too), below 1024 the form is a
 *  full page. */
function PlannedNewRoute() {
  const { isDesktop } = useBreakpoint()
  return isDesktop ? <Planned /> : <NewPlannedPage />
}

/** The recurring rule form's host follows the tier: at 1024+ the Planned
 *  list hosts the form in its side panel (it reads the rule routes itself,
 *  so every route using this wrapper renders <Planned /> there), below
 *  1024 the form is a full page. */
function RecurringRuleRoute() {
  const { isDesktop } = useBreakpoint()
  return isDesktop ? <Planned /> : <RecurringRulePage />
}

function AppContent() {
  return (
    <MainLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/:id" element={<AccountPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/budgets/:id" element={<BudgetDetailPage />} />
        <Route path="/budgets/:id/periods" element={<BudgetPeriodsPage />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/transactions/:id" element={<TransactionRecordRoute />} />
        <Route path="/planned" element={<Planned />} />
        <Route path="/planned/:id" element={<PlannedRecordRoute />} />
        <Route path="/planned/:id/pay" element={<PlannedPayRoute />} />
        <Route path="/planned/rules/new" element={<RecurringRuleRoute />} />
        <Route path="/planned/rules/:id" element={<RecurringRuleRoute />} />
        <Route path="/planned/new" element={<PlannedNewRoute />} />
        <Route path="/transfers" element={<TransfersPage />} />
        <Route path="/transfers/:id" element={<TransferRecordRoute />} />
        <Route path="/new" element={<NewTransactionPage />} />
        <Route path="/members" element={<WorkspaceMembersPage />} />
        <Route path="/bookmarks" element={<BookmarksPage />} />
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
          <LanguageProvider>
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
          </LanguageProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

export default App
