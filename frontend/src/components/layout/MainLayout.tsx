import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import Sidebar from './Sidebar'
import { HiMenu } from 'react-icons/hi'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import CreateWorkspaceForm, { CreateWorkspaceButton } from './CreateWorkspaceForm'

const SIDEBAR_COLLAPSED_KEY = 'monie-sidebar-collapsed'

interface MainLayoutProps {
  children: ReactNode
}

function NoWorkspaceMessage() {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">No workspace selected</h2>
        <p className="text-gray-500 mb-4">Create a workspace or ask to be added to one.</p>
        
        {!showForm ? (
          <CreateWorkspaceButton onClick={() => setShowForm(true)} />
        ) : (
          <CreateWorkspaceForm onCancel={() => setShowForm(false)} />
        )}
      </div>
    </div>
  )
}

export default function MainLayout({ children }: MainLayoutProps) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
  const { workspace, isLoading } = useWorkspace()

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      return stored === 'true'
    }
    return false
  })

  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile drawer on route change
  const location = useLocation()
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Close mobile drawer on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

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
      <div className="min-h-screen bg-gray-50">
        {/* Mobile top bar */}
        <div className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-200 flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            aria-label="Open navigation menu"
          >
            <HiMenu className="h-6 w-6" />
          </button>
          <span className="text-lg font-bold text-gray-900">Monie</span>
        </div>

        {/* Mobile drawer overlay */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setMobileOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 flex">
              <Sidebar
                collapsed={false}
                onToggleCollapse={() => setMobileOpen(false)}
                onClose={() => setMobileOpen(false)}
              />
            </div>
          </>
        )}

        {/* Main content with top padding for the fixed bar */}
        <main className="pt-14 px-4 py-6">
          {!workspace && !isLoading ? <NoWorkspaceMessage /> : children}
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-shrink-0">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </div>
      <main className="flex-1 overflow-y-auto p-6">
        {!workspace && !isLoading ? <NoWorkspaceMessage /> : children}
      </main>
    </div>
  )
}
