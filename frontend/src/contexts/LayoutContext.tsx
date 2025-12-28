import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

type LayoutMode = 'auto' | 'cards'

interface LayoutContextType {
  layoutMode: LayoutMode
  setLayoutMode: (mode: LayoutMode) => void
  isCardsView: boolean // true when cards should be shown (either forced or auto on mobile)
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined)

const STORAGE_KEY = 'monie-layout-mode'

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored === 'cards' || stored === 'auto') ? stored : 'auto'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, layoutMode)
  }, [layoutMode])

  const setLayoutMode = (mode: LayoutMode) => {
    setLayoutModeState(mode)
  }

  // In 'cards' mode, always show cards. In 'auto' mode, CSS handles it.
  const isCardsView = layoutMode === 'cards'

  return (
    <LayoutContext.Provider value={{ layoutMode, setLayoutMode, isCardsView }}>
      {children}
    </LayoutContext.Provider>
  )
}

export function useLayout() {
  const context = useContext(LayoutContext)
  if (context === undefined) {
    throw new Error('useLayout must be used within a LayoutProvider')
  }
  return context
}
