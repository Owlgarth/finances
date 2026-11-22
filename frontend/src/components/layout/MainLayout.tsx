import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
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
 * Phone scroll memory, POP-only: Back/Forward returns a view to its saved
 * offset once the document is tall enough to hold it; every new navigation
 * (tab switch, filter change, fresh visit) starts at the top. Keyed by
 * pathname + search so each filtered view keeps its own place. While the
 * document is still too short (skeleton height), the apply waits for it to
 * grow (ResizeObserver on document.documentElement + window resize), giving
 * up after 3s, on the first user scroll input (wheel/touchmove/keydown -
 * the programmatic restore fires none of these), or on the next navigation.
 * Mobile only - the 640-1023 band scrolls <main>
 * (hooks/useMainScrollRestoration.ts) and the desktop window does not
 * scroll.
 */
function useMobileScrollRestoration(enabled: boolean) {
  const location = useLocation()
  const navType = useNavigationType()
  const positions = useRef(new Map<string, number>())
  // A deferred restore waiting for the document to grow. The save listener
  // must not overwrite this key while the apply is pending (the interim
  // top position and the apply's own scroll event would clobber it).
  const pending = useRef<{ key: string; top: number } | null>(null)

  const key = location.pathname + location.search

  // Save continuously; passive so it never delays scrolling.
  useEffect(() => {
    if (!enabled) return
    const save = () => {
      if (pending.current?.key === key) return
      positions.current.set(key, window.scrollY)
    }
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [enabled, key])

  // Own browser scroll restoration while enabled: the browser's own async
  // POP restore clamps to the skeleton height (the bug this hook fixes)
  // and would race the deferred apply. Reverted on cleanup so the 640px
  // crossing hands control back.
  useEffect(() => {
    if (!enabled) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [enabled])

  useLayoutEffect(() => {
    if (!enabled) return
    // Give-up condition: the next navigation. Any pending restore for
    // another key is dead (layout effects flush before the passive
    // effects below, so the arm never arms a stale pending).
    if (pending.current && pending.current.key !== key) pending.current = null
    // useNavigationType() reads POP for the initial load too - harmless:
    // a fresh visit has no saved entry and falls through to the top.
    const saved = navType === 'POP' ? positions.current.get(key) : undefined
    if (saved !== undefined) {
      const fits =
        document.documentElement.scrollHeight - window.innerHeight >= saved
      if (fits) {
        window.scrollTo(0, saved)
        return
      }
      // Document still too short (list not rendered yet): start at the
      // top; the effect below applies the offset once it fits.
      pending.current = { key, top: saved }
      window.scrollTo(0, 0)
      return
    }
    // PUSH, REPLACE, or a POP with no memory of this view: the previous
    // page's offset must not bleed into the new one.
    window.scrollTo(0, 0)
  }, [enabled, key, navType])

  // Deferred apply arm. Runs on the same commit as the layout effect
  // above (layout effects flush first), so it sees a pending it just set.
  useEffect(() => {
    if (!enabled) return
    const restore = pending.current
    if (!restore || restore.key !== key) return

    const fits = () =>
      document.documentElement.scrollHeight - window.innerHeight >= restore.top
    const cleanup = () => {
      observer.disconnect()
      window.clearTimeout(timer)
      window.removeEventListener('resize', check)
      window.removeEventListener('wheel', cancel)
      window.removeEventListener('touchmove', cancel)
      window.removeEventListener('keydown', cancel)
    }
    const apply = () => {
      cleanup()
      pending.current = null
      window.scrollTo(0, restore.top)
    }
    const check = () => {
      if (fits()) apply()
    }
    const cancel = () => {
      cleanup()
      pending.current = null
    }
    const timer = window.setTimeout(cancel, 3000)
    const observer = new ResizeObserver(check)
    // document.documentElement's box grows with the content: index.css
    // sets no height on html/body (body: margin 0, min-width 320px,
    // min-height 100vh) and MainLayout's min-h-screen wrapper only sets
    // a floor, so html's auto height tracks the growing list. A viewport
    // resize (rotation) can also unblock the apply, so re-check there
    // too.
    observer.observe(document.documentElement)
    window.addEventListener('resize', check)
    window.addEventListener('wheel', cancel, { passive: true })
    window.addEventListener('touchmove', cancel, { passive: true })
    window.addEventListener('keydown', cancel)
    check()
    return cleanup
  }, [enabled, key])
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
