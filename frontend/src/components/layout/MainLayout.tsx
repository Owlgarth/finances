import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import AccountMenuSheet from './AccountMenuSheet'
import { AccountMenuProvider } from './AccountMenuContext'
import CommandPalette from '../common/CommandPalette'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import CreateWorkspaceForm, { CreateWorkspaceButton } from './CreateWorkspaceForm'

const SIDEBAR_COLLAPSED_KEY = 'owlgarth-sidebar-collapsed'

interface MainLayoutProps {
  children: ReactNode
}

function NoWorkspaceMessage() {
  const { t } = useTranslation('common')
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text mb-2">{t('layout.noWorkspaceTitle')}</h2>
        <p className="text-text-muted mb-4">{t('layout.noWorkspaceBody')}</p>

        <CreateWorkspaceButton onClick={() => setShowForm(true)} />
        {/* Mount-per-use: the conditional render is the open/close mechanism
            (see the form's docblock), so each open starts from fresh state. */}
        {showForm && <CreateWorkspaceForm onClose={() => setShowForm(false)} />}
      </div>
    </div>
  )
}

/**
 * Native-tab scroll memory: each route keeps its scroll position, so
 * switching bottom-nav tabs returns you where you left off instead of
 * carrying the previous page's offset. Mobile only — desktop scrolls <main>,
 * whose position React keeps across route swaps anyway.
 */
function useMobileScrollRestoration(enabled: boolean) {
  const location = useLocation()
  const positions = useRef(new Map<string, number>())

  useEffect(() => {
    if (!enabled) return
    const save = () => positions.current.set(location.pathname, window.scrollY)
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [enabled, location.pathname])

  useLayoutEffect(() => {
    if (!enabled) return
    window.scrollTo(0, positions.current.get(location.pathname) ?? 0)
  }, [enabled, location.pathname])
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { isMobile, isTablet, isWide } = useBreakpoint()
  const { workspace, isLoading } = useWorkspace()

  useMobileScrollRestoration(isMobile)

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      // Tablet mounts collapsed, mirroring the old mount-time auto-collapse
      // effect; the stored preference is a desktop concern. Safe to read
      // isTablet/isWide here: useBreakpoint is accurate on first render
      // (lazy matchMedia initializer in useMediaQuery).
      if (isTablet) return true
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      // Desktop below 1280 also mounts collapsed - a full sidebar plus the
      // record side panel leaves too little room for the list. With no
      // stored preference, 1280+ stays expanded: the wide tier keeps
      // today's default.
      if (!isWide && stored === null) return true
      return stored === 'true'
    }
    return false
  })

  // Auto-collapse when the viewport crosses INTO the tablet tier. Prev-tier
  // render adjust (P3): the initializer above owns the mount case (the latch
  // initializes equal to isTablet, so nothing fires on mount), and crossing
  // OUT of tablet deliberately does nothing - a manual un-collapse on tablet
  // must survive the resize to desktop, mirroring the old effect's
  // `if (isTablet)` guard. A later desktop->tablet crossing collapses again.
  const [prevIsTablet, setPrevIsTablet] = useState(isTablet)
  if (prevIsTablet !== isTablet) {
    setPrevIsTablet(isTablet)
    if (isTablet) setCollapsed(true)
  }

  // Wide-tier crossing: while NO stored preference exists, crossing the
  // 1280 boundary re-applies the mount default for the new tier (fresh-mount
  // semantics). prefIsNull is read once, here at mount; toggleCollapse flips
  // it false in the same batched update that writes the key, so the very
  // first manual toggle permanently disarms this adjust - stored preference
  // wins from then on. Self-disproving prev-tier guard, like the tablet
  // adjust above: the latch initializes equal to isWide so nothing fires on
  // mount, and setPrevIsWide(isWide) makes the condition false on the
  // immediate re-render - loop-safe by construction.
  const [prefIsNull, setPrefIsNull] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === null
  )
  const [prevIsWide, setPrevIsWide] = useState(isWide)
  if (prevIsWide !== isWide) {
    setPrevIsWide(isWide)
    if (prefIsNull) setCollapsed(!isWide)
  }

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
    // Same batched update as the write above: a stored preference now
    // exists, so prefIsNull goes false and the wide-tier crossing adjust
    // is permanently inert from here on.
    setPrefIsNull(false)
  }

  // The account-menu provider wraps the whole layout: page headers call
  // its hook unconditionally (the account buttons are CSS-hidden, not
  // branch-gated, on desktop), and its identity never changes across a
  // width crossing.
  return (
    <AccountMenuProvider>
      {/* One tree at every width: children, the sheets and the palette
          mount once and survive the 640px crossing (the record page's
          edit-in-place drafts depend on it). Width chrome is CSS-gated
          instead - the PageHeader account-actions precedent (sm:hidden
          pair) at layout scale. */}
      <div className="min-h-screen bg-background sm:h-screen sm:flex">
        <div className="hidden sm:block shrink-0">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
          />
        </div>
        {/* Top padding covers the standalone-PWA status bar (0 in a browser
            tab); bottom padding clears the fixed bottom nav + raised FAB.
            The sm: overrides are axis-matched to the base paddings
            (px<->px, pt<->pt, pb<->pb): every sm:* rule compiles after
            every base utility in the sheet (offsets verified in
            dist/assets/*.css), so each override replaces exactly the
            property its base twin set. Keep the pairing axis-matched -
            never a box padding shorthand over axis bases. */}
        <main className="px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6 sm:flex-1 sm:overflow-y-auto">
          {!workspace && !isLoading ? <NoWorkspaceMessage /> : children}
        </main>
        <BottomNav />
        <AccountMenuSheet />
        <CommandPalette />
      </div>
    </AccountMenuProvider>
  )
}
