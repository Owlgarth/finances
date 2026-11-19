import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { FileText, Landmark, LayoutDashboard, Plus, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { usePermissions } from '../../hooks/usePermissions'
import { intListParam } from '../../utils/params'

interface TabProps {
  to: string
  label: string
  icon: LucideIcon
  exact?: boolean
  // Sibling routes (prefix match) that also light this tab. NavLink's own
  // match covers only `to`, so a tab standing for several routes derives
  // its active state from the live pathname instead.
  activeFor?: readonly string[]
}

// components.md §19: 20px icons, 10px uppercase labels, active = text-primary.
function Tab({ to, label, icon: Icon, exact = false, activeFor }: TabProps) {
  const location = useLocation()
  const tabClass = (active: boolean) =>
    `flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 min-h-[44px] transition-colors ${
      active ? 'text-primary' : 'text-text-muted'
    }`
  return (
    <NavLink
      to={to}
      end={exact}
      className={
        activeFor
          ? () => tabClass(activeFor.some((prefix) => location.pathname.startsWith(prefix)))
          : ({ isActive }) => tabClass(isActive)
      }
    >
      <Icon size={20} strokeWidth={1.5} />
      <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
    </NavLink>
  )
}

/**
 * Mobile navigation shell (M4): five-slot bottom bar (Home, Activity, FAB,
 * Accounts, Budgets); the FAB navigates to /new. The account menu lives
 * in AccountMenuSheet, opened from the page-header profile button.
 */
export default function BottomNav() {
  const { t } = useTranslation('nav')
  const { workspace } = useWorkspace()
  const { canWrite } = usePermissions()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // The add button navigates to /new - no action sheet. Carry rules follow
  // ActivityTabs' carrySearch: the account filter travels only when the URL
  // holds exactly one id (/new seeds a single account, never a CSV), and
  // /transfers also carries type=transfer - a scope change, not a copy.
  const handleQuickAdd = () => {
    const next = new URLSearchParams()
    if (location.pathname === '/transfers') next.set('type', 'transfer')
    const accountIds = intListParam(searchParams, 'account')
    if (accountIds.length === 1) next.set('account', String(accountIds[0]))
    const search = next.toString()
    // Plain push, never replace: Back returns to the list the user left.
    navigate(`/new${search ? `?${search}` : ''}`)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-bottom-nav bg-surface border-t border-border flex items-end pb-safe">
      <Tab to="/" label={t('home')} icon={LayoutDashboard} exact />
      <Tab
        to="/transactions"
        label={t('activity')}
        icon={FileText}
        activeFor={['/transactions', '/planned', '/transfers']}
      />

      {/* Center FAB slot - kept even when hidden (viewer role, no workspace,
          or on /new itself, where the page already IS the create form) so
          the four tabs don't shift. */}
      <div className="flex-1 flex flex-col items-center">
        {workspace && canWrite && location.pathname !== '/new' && (
          <button
            type="button"
            onClick={handleQuickAdd}
            aria-label={t('addRecord')}
            className="-mt-5 w-12 h-12 bg-primary border border-border rounded-sm flex items-center justify-center text-background hover:bg-primary-hover active:scale-95 transition-all"
          >
            <Plus size={20} strokeWidth={1.5} />
          </button>
        )}
      </div>

      <Tab to="/accounts" label={t('accounts')} icon={Landmark} />
      <Tab to="/budgets" label={t('budgets')} icon={Wallet} />
    </nav>
  )
}
