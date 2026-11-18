import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Calendar,
  Check,
  Globe,
  Landmark,
  ListPlus,
  Loader2,
  LogOut,
  Plus,
  RotateCw,
  Search,
  Settings,
  Users,
  Wallet,
  X,
  ZoomIn,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useVisibleBookmarks } from '../../hooks/useBookmarks'
import { useWorkspaceSwitch } from '../../hooks/useWorkspaceSwitch'
import { useLanguage } from '../../i18n/LanguageContext'
import { bookmarkIsActive, bookmarkTargetPath } from '../../utils/bookmarks'
import { isZoomDisabled, setZoomDisabled } from '../../utils/zoomLock'
import { BookmarkGlyph } from '../bookmarks/bookmarkMeta'
import { openPageSearch } from '../common/CommandPalette'
import BottomSheet from '../common/BottomSheet'
import Switch from '../common/Switch'
import RoleBadge from '../common/RoleBadge'
import CreateWorkspaceForm from './CreateWorkspaceForm'
import LanguageModal from './LanguageModal'
import ThemeToggleRow from './ThemeToggleRow'
import WorkspaceSettingsPanel from './WorkspaceSettingsPanel'
import { useAccountMenu } from './AccountMenuContext'
import registry from '../../../../backend/common/languages.json'

// Exported for the bottom bar's tab-highlight check, which needs the same
// destination list while the More tab still exists; the import goes away
// with the tab.
// Overflow destinations live in the More sheet.
// Keys only: t() is resolved at render time inside the component (a
// module-level t() call would freeze the language at load time).
export const MORE_DESTINATIONS = [
  { to: '/accounts', labelKey: 'accounts', icon: Wallet },
  { to: '/planned', labelKey: 'planned', icon: Calendar },
  { to: '/members', labelKey: 'members', icon: Users },
  { to: '/settings', labelKey: 'settings', icon: Settings },
] as const

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-muted truncate">
      {children}
    </div>
  )
}

const moreRowClass =
  'w-full min-h-[44px] px-4 flex items-center gap-3 text-sm text-left text-text transition-colors active:bg-surface-hover disabled:opacity-50'

/**
 * Account menu sheet (phones): overflow destinations, workspace switching
 * and user controls - the mobile counterpart of the desktop sidebar's
 * user area. Opened from the bottom bar's More tab and from page headers
 * through AccountMenuContext.
 */
export default function AccountMenuSheet() {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const { user, logout } = useAuth()
  const { workspace, workspaces } = useWorkspace()
  const { switchingToId, switchTo } = useWorkspaceSwitch()
  const { language } = useLanguage()
  // Shared derivation (hooks/useBookmarks): the sheet's bookmarks section
  // follows the same visibility rule and cap as the sidebar's.
  const { any: anyBookmarks, visible: visibleBookmarks } = useVisibleBookmarks()
  const { openTick } = useAccountMenu()

  const [moreOpen, setMoreOpen] = useState(false)
  // Mirrors the stored zoom preference (utils/zoomLock) for the Switch.
  const [zoomLocked, setZoomLocked] = useState(isZoomDisabled)
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false)
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false)
  // Language picker modal; the More sheet closes itself before this opens.
  const [langOpen, setLangOpen] = useState(false)

  // Close the More sheet when navigation happens from inside it; the create
  // and language modals follow suit so no modal outlives the page it was
  // opened on. Prev-path render adjust (P3): NavLink taps and browser
  // back/forward change the location with no event handler this component
  // sees, so there is no P4 seam. The key is pathname PLUS search: bookmark
  // rows navigate same-pathname-different-filters (a transactions bookmark
  // tapped from /transactions), which a pathname-only latch would never
  // see. The latch initializes to the current path, so unlike the old
  // effect it does not fire on mount - where all three flags are already
  // false (the old mount-run was a no-op).
  const [prevPath, setPrevPath] = useState(location.pathname + location.search)
  if (prevPath !== location.pathname + location.search) {
    setPrevPath(location.pathname + location.search)
    setMoreOpen(false)
    setCreateWorkspaceOpen(false)
    setLangOpen(false)
  }

  // Open requests arrive from outside this component (More tab, page
  // header) as a monotonic tick; this render-adjust turns each new tick
  // into an open. Self-disproving latch: setSeenOpenTick lands on the
  // tick's own value, so the adjust runs exactly once per request and
  // nothing fires on mount.
  const [seenOpenTick, setSeenOpenTick] = useState(openTick)
  if (seenOpenTick !== openTick) {
    setSeenOpenTick(openTick)
    setMoreOpen(true)
  }

  const activeLanguage = registry.languages.find((l) => l.code === language)

  return (
    <>
      {/* More sheet: overflow destinations + workspace + user controls */}
      <BottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        aria-label={t('more')}
      >
        <div className="pb-2">
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false)
              openPageSearch()
            }}
            className={moreRowClass}
          >
            <Search size={16} strokeWidth={1.5} className="shrink-0" />
            {t('search')}
          </button>
          {MORE_DESTINATIONS.map((d) => (
            <NavLink
              key={d.to}
              to={d.to}
              className={({ isActive }) =>
                `${moreRowClass} ${isActive ? 'font-medium bg-surface-hover' : ''}`
              }
            >
              <d.icon size={16} strokeWidth={1.5} className="shrink-0" />
              {t(d.labelKey)}
            </NavLink>
          ))}
          {/* Logout lives mid-sheet (below Settings), NOT as the bottom row:
              the bottom row sits right where the thumb tapped "More" and was
              collecting accidental logouts. */}
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false)
              logout()
            }}
            className={moreRowClass}
          >
            <LogOut size={16} strokeWidth={1.5} className="shrink-0" />
            {t('logout')}
          </button>

          {anyBookmarks && (
            <div className="border-t border-border mt-2">
              <SectionLabel>{t('bookmarks')}</SectionLabel>
              {visibleBookmarks.map((b) => (
                <NavLink
                  key={b.id}
                  to={bookmarkTargetPath(b)}
                  className={() =>
                    `${moreRowClass} ${bookmarkIsActive(b, location) ? 'font-medium bg-surface-hover' : ''}`
                  }
                >
                  <BookmarkGlyph bookmark={b} size={16} strokeWidth={1.5} />
                  <span className="truncate flex-1">{b.name}</span>
                </NavLink>
              ))}
              <NavLink to="/bookmarks" className={moreRowClass}>
                <ListPlus size={16} strokeWidth={1.5} className="shrink-0" />
                {t('bookmarksManage')}
              </NavLink>
            </div>
          )}

          <div className="border-t border-border mt-2">
            <SectionLabel>{t('workspace')}</SectionLabel>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => switchTo(ws, () => setMoreOpen(false))}
                disabled={switchingToId !== null}
                className={moreRowClass}
              >
                {ws.id === workspace?.id ? (
                  <Check size={16} className="text-primary shrink-0" />
                ) : switchingToId === ws.id ? (
                  <Loader2 size={16} className="animate-spin shrink-0" />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className="truncate flex-1">{ws.name}</span>
                <RoleBadge role={ws.user_role} />
              </button>
            ))}
            {/* Closes the sheet before opening the create modal, so the modal
                is the only overlay layer (one Escape press, one dismissal). */}
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                setCreateWorkspaceOpen(true)
              }}
              className={moreRowClass}
            >
              <Plus size={16} className="shrink-0" />
              {t('createWorkspace')}
            </button>
            {workspace && (
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  setWorkspaceSettingsOpen(true)
                }}
                className={moreRowClass}
              >
                <Landmark size={16} className="shrink-0" />
                {t('workspaceSettings')}
              </button>
            )}
          </div>

          <div className="border-t border-border mt-2">
            <SectionLabel>{user?.full_name || user?.email}</SectionLabel>
            {/* PWA has no browser chrome to refresh with. */}
            <button type="button" onClick={() => window.location.reload()} className={moreRowClass}>
              <RotateCw size={16} strokeWidth={1.5} className="shrink-0" />
              {t('reload')}
            </button>
            <ThemeToggleRow />
            {/* Closes the sheet before opening the language picker, so the
                modal is the only overlay layer (one Escape press, one
                dismissal). The active language's native name is registry
                data, shown truncated so a long name cannot stretch the
                row. */}
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false)
                setLangOpen(true)
              }}
              className={moreRowClass}
            >
              <Globe size={16} strokeWidth={1.5} className="shrink-0" />
              <span className="flex-1 truncate">{t('language')}</span>
              <span className="shrink-0 max-w-[96px] truncate text-text-muted">{activeLanguage?.nativeName}</span>
            </button>
            <div className="flex items-center justify-between min-h-[44px] px-4">
              <span className="flex items-center gap-3 text-sm text-text">
                <ZoomIn size={16} strokeWidth={1.5} className="shrink-0" />
                {t('disableZoom')}
              </span>
              <Switch
                checked={zoomLocked}
                onChange={() => {
                  const next = !zoomLocked
                  setZoomLocked(next)
                  setZoomDisabled(next)
                }}
                aria-label={t('disableZoom')}
              />
            </div>
            {/* Logout's old slot (the double-tap misclick zone): only the
                left-side Close button is interactive - the rest of the row
                deliberately does nothing, so a stray tap can't trigger
                anything. Do NOT stretch the button to the full row. */}
            <div className="flex items-center min-h-[44px] px-4">
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 min-h-[44px] pr-4 text-sm text-text transition-colors active:bg-surface-hover"
              >
                <X size={16} strokeWidth={1.5} className="shrink-0" />
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Create-workspace modal (mount-per-use): the More sheet's trigger row
          closes the sheet first, so this is the only overlay layer while open. */}
      {createWorkspaceOpen && (
        <CreateWorkspaceForm onClose={() => setCreateWorkspaceOpen(false)} />
      )}
      {/* Language picker modal (mount-per-use): the More sheet's opener row
          closes the sheet first, so this is the only overlay layer while
          open. */}
      {langOpen && <LanguageModal onClose={() => setLangOpen(false)} />}

      {workspace && (
        <WorkspaceSettingsPanel
          isOpen={workspaceSettingsOpen}
          onClose={() => setWorkspaceSettingsOpen(false)}
        />
      )}
    </>
  )
}
