import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Landmark,
  LayoutDashboard,
  ListPlus,
  Search,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { reportsApi } from '../../api/client'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useVisibleBookmarks } from '../../hooks/useBookmarks'
import { useBudgets, useMultiCurrency } from '../../hooks/useDomain'
import { bookmarkIsActive, bookmarkTargetPath } from '../../utils/bookmarks'
import { formatAmount } from '../../utils/format'
import { BookmarkGlyph } from '../bookmarks/bookmarkMeta'
import { isMacLike, openPageSearch } from '../common/CommandPalette'
import UserMenu from './UserMenu'
import WorkspaceSelector from './WorkspaceSelector'
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel'

// The Activity destination covers all three list routes. NavLink's own
// matching lights only the link's own path, so the Activity row styles
// itself from the live location instead (the bookmark-row idiom); NavLink
// still sets aria-current from its own match - the class carries the
// visual state on the other two routes.
const ACTIVITY_ROUTES = ['/transactions', '/planned', '/transfers'] as const

// Sub-lists cap at six rows; a View-all link covers the rest.
const SUB_ROW_CAP = 6

// Shared row register for item and footer rows.
function navRowClass(active: boolean): string {
  return `flex items-center gap-3 px-3 py-2 rounded-sm transition-colors mb-1 group
    ${active
      ? 'bg-surface-hover border-l-2 border-primary text-text font-medium'
      : 'text-text-muted hover:bg-surface-hover hover:text-text'
    }`
}

// Sub-row register: the item rhythm, indented to the parent's label
// (px-3 + 14px icon + gap-3 = 38px). Padding sides are spelled out
// separately - stacking pl-* on px-* would resolve through compiled-sheet
// order of logical vs physical padding utilities.
function subRowClass(active: boolean): string {
  return `flex items-center gap-3 py-2 pl-[38px] pr-3 rounded-sm transition-colors mb-1
    ${active
      ? 'bg-surface-hover border-l-2 border-primary text-text font-medium'
      : 'text-text-muted hover:bg-surface-hover hover:text-text'
    }`
}

// Nav region, mounted only with a workspace: the balances/budgets queries
// here are workspace-scoped GETs with no enabled flag, and the domain-hook
// precedent gates them at the mount instead.
function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const { any: anyBookmarks, visible: visibleBookmarks } = useVisibleBookmarks()
  const multiCurrency = useMultiCurrency()
  // Same key as the Dashboard/Accounts balances view: saves elsewhere in
  // the app invalidate the ['current-balances'] prefix, so this entry
  // refreshes with zero extra wiring.
  const { data: balances } = useQuery({
    queryKey: ['current-balances', false],
    queryFn: () => reportsApi.currentBalances(false),
  })
  const { data: budgets = [] } = useBudgets(false)

  const accountRows = balances?.accounts ?? []
  const cappedAccounts = accountRows.slice(0, SUB_ROW_CAP)
  const cappedBudgets = budgets.slice(0, SUB_ROW_CAP)

  return (
    <nav className="flex-1 overflow-y-auto p-2">
      <button
        type="button"
        onClick={openPageSearch}
        title={collapsed ? t('search') : undefined}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-sm transition-colors mb-1 text-text-muted hover:bg-surface-hover hover:text-text"
      >
        <Search size={14} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="font-mono text-xs uppercase tracking-wider flex-1 text-left">{t('search')}</span>
            <kbd className="text-[10px] font-mono border border-border rounded-sm px-1 py-0.5 text-text-muted">
              {isMacLike ? '⌘K' : 'Ctrl K'}
            </kbd>
          </>
        )}
      </button>
      <NavLink
        to="/"
        end
        className={({ isActive }) => navRowClass(isActive)}
        title={collapsed ? t('home') : undefined}
      >
        <LayoutDashboard size={14} className="shrink-0" />
        {!collapsed && <span className="font-mono text-xs uppercase tracking-wider">{t('home')}</span>}
      </NavLink>
      <NavLink
        to="/transactions"
        className={() =>
          navRowClass(ACTIVITY_ROUTES.some((route) => location.pathname.startsWith(route)))
        }
        title={collapsed ? t('activity') : undefined}
      >
        <FileText size={14} className="shrink-0" />
        {!collapsed && <span className="font-mono text-xs uppercase tracking-wider">{t('activity')}</span>}
      </NavLink>
      <NavLink
        to="/accounts"
        className={({ isActive }) => navRowClass(isActive)}
        title={collapsed ? t('accounts') : undefined}
      >
        <Landmark size={14} className="shrink-0" />
        {!collapsed && <span className="font-mono text-xs uppercase tracking-wider">{t('accounts')}</span>}
      </NavLink>
      {/* Per-account destinations (the budget sub-row precedent): NavLink
          with no end - segment-aware matching lights only the open
          account's row and cannot collide /accounts/5 with /accounts/55. */}
      {!collapsed &&
        cappedAccounts.map((a) => (
          <NavLink key={a.account_id} to={`/accounts/${a.account_id}`} className={({ isActive }) => subRowClass(isActive)}>
            <span className="font-mono text-xs uppercase tracking-wider truncate flex-1 min-w-0 text-left">
              {a.account_name}
            </span>
            <span className="font-mono text-xs whitespace-nowrap shrink-0">
              {formatAmount(a.balance)} {multiCurrency ? a.currency_code : ''}
            </span>
          </NavLink>
        ))}
      {!collapsed && accountRows.length > SUB_ROW_CAP && (
        <Link to="/accounts" className={subRowClass(false)}>
          <span className="font-mono text-xs uppercase tracking-wider">{t('viewAllAccounts')}</span>
        </Link>
      )}
      <NavLink
        to="/budgets"
        className={({ isActive }) => navRowClass(isActive)}
        title={collapsed ? t('budgets') : undefined}
      >
        <Wallet size={14} className="shrink-0" />
        {!collapsed && <span className="font-mono text-xs uppercase tracking-wider">{t('budgets')}</span>}
      </NavLink>
      {!collapsed &&
        cappedBudgets.map((b) => (
          <NavLink
            key={b.id}
            to={`/budgets/${b.id}`}
            className={({ isActive }) => subRowClass(isActive)}
          >
            <span className="font-mono text-xs uppercase tracking-wider truncate">{b.name}</span>
          </NavLink>
        ))}
      {!collapsed && budgets.length > SUB_ROW_CAP && (
        <Link to="/budgets" className={subRowClass(false)}>
          <span className="font-mono text-xs uppercase tracking-wider">{t('viewAllBudgets')}</span>
        </Link>
      )}
      {anyBookmarks && (
        <>
          <div className="border-t border-border mx-1 my-2" aria-hidden="true" />
          <div>
            {!collapsed && (
              <div className="px-3 pt-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted truncate">
                {t('bookmarks')}
              </div>
            )}
            {visibleBookmarks.map((b) => (
              <NavLink
                key={b.id}
                to={bookmarkTargetPath(b)}
                className={() =>
                  `flex items-center gap-3 px-3 py-2 rounded-sm transition-colors mb-1
                  ${bookmarkIsActive(b, location)
                    ? 'bg-surface-hover border-l-2 border-primary text-text font-medium'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text'
                  }`
                }
                title={collapsed ? b.name : undefined}
              >
                <BookmarkGlyph bookmark={b} size={14} />
                {!collapsed && (
                  <span className="font-mono text-xs uppercase tracking-wider truncate">{b.name}</span>
                )}
              </NavLink>
            ))}
            <NavLink
              to="/bookmarks"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-sm transition-colors mb-1
                ${isActive
                  ? 'bg-surface-hover border-l-2 border-primary text-text font-medium'
                  : 'text-text-muted hover:bg-surface-hover hover:text-text'
                }`
              }
              title={collapsed ? t('bookmarksManage') : undefined}
            >
              <ListPlus size={14} className="shrink-0" />
              {!collapsed && (
                <span className="font-mono text-xs uppercase tracking-wider">{t('bookmarksManage')}</span>
              )}
            </NavLink>
          </div>
        </>
      )}
    </nav>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const { t } = useTranslation('nav')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { workspace } = useWorkspace()

  const handleOpenSettings = () => setIsSettingsOpen(true)

  return (
    <>
      <aside
        className={`flex flex-col h-full bg-surface border-r border-border transition-all duration-200 z-sidebar
          ${collapsed ? 'w-14' : 'w-60'}`}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between p-4 shrink-0 mb-4">
          {!collapsed && (
            <span className="font-sans font-semibold text-primary text-base tracking-tight select-none whitespace-nowrap">Owlgarth Finances</span>
          )}
          <button
            onClick={onToggleCollapse}
            className={`p-1.5 rounded-sm text-text-muted hover:text-text hover:bg-surface-hover transition-colors
              ${collapsed ? 'mx-auto' : ''}`}
            aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Workspace selector — icon-only in the collapsed rail (responsive.md tablet spec) */}
        <div className={`shrink-0 mt-3 ${collapsed ? 'p-2' : 'p-3 space-y-3'}`}>
          <WorkspaceSelector onOpenSettings={handleOpenSettings} collapsed={collapsed} />
        </div>

        {/* Nav links */}
        {workspace ? (
          <SidebarNav collapsed={collapsed} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <p className="text-sm text-text-muted mb-2">{t('noWorkspace')}</p>
              <p className="text-xs text-text-muted">
                {t('noWorkspaceHint')}
              </p>
            </div>
          </div>
        )}

        {/* Bottom: workspace footer rows above the user menu. Rows carry
            their own mb-1 (the nav-region rhythm), so the container sets
            no space-y. */}
        <div className="p-2 shrink-0 py-3 mt-3">
          {workspace && (
            <>
              <div className="border-t border-border mx-1 my-2" aria-hidden="true" />
              <NavLink
                to="/members"
                className={({ isActive }) => navRowClass(isActive)}
                title={collapsed ? t('members') : undefined}
              >
                <Users size={14} className="shrink-0" />
                {!collapsed && <span className="font-mono text-xs uppercase tracking-wider">{t('members')}</span>}
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) => navRowClass(isActive)}
                title={collapsed ? t('settings') : undefined}
              >
                <Settings size={14} className="shrink-0" />
                {!collapsed && <span className="font-mono text-xs uppercase tracking-wider">{t('settings')}</span>}
              </NavLink>
            </>
          )}
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
