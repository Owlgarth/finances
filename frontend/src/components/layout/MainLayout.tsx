import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import CommandPalette from '../common/CommandPalette'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import CreateWorkspaceForm, { CreateWorkspaceButton } from './CreateWorkspaceForm'

const SIDEBAR_COLLAPSED_KEY = 'owlgarth-sidebar-collapsed'

interface MainLayoutProps {
  children: ReactNode
}

function NoWorkspaceMessage() {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text mb-2">No workspace selected</h2>
        <p className="text-text-muted mb-4">Create a workspace or ask to be added to one.</p>

        <CreateWorkspaceButton onClick={() => setShowForm(true)} />
        {/* Mount-per-use: the conditional render is the open/close mechanism
            (see the form's docblock), so each open starts from fresh state. */}
        {showForm && <CreateWorkspaceForm onClose={() => setShowForm(false)} />}
      </div>
    </div>
  )
}

/**
 * Native-tab scroll memory (N2): each route keeps its scroll position, so
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
  const { isMobile, isTablet } = useBreakpoint()
  const { workspace, isLoading } = useWorkspace()

  useMobileScrollRestoration(isMobile)

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      return stored === 'true'
    }
    return false
  })

  // Auto-collapse on tablet
  useEffect(() => {
    if (isTablet) {
      setCollapsed(true)
    }
  }, [isTablet])

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        {/* Top padding covers the standalone-PWA status bar (0 in a browser tab);
            bottom padding clears the fixed bottom nav + raised FAB. */}
        <main className="px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
          {!workspace && !isLoading ? <NoWorkspaceMessage /> : children}
        </main>
        <BottomNav />
        <CommandPalette />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <div className="flex-shrink-0">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>
      <main className="flex-1 overflow-y-auto p-6">
        {!workspace && !isLoading ? <NoWorkspaceMessage /> : children}
      </main>
      <CommandPalette />
    </div>
  )
}
