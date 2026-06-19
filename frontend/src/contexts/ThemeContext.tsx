import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const THEME_STORAGE_KEY = 'denarly_theme'

interface ThemeContextType {
  isDark: boolean
  toggleTheme: () => void
  setDark: (dark: boolean) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

function applyDark(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize from the class the FOUC script (index.html) already set on <html>
  // before React rendered. Guarantees the first React paint matches the actual
  // DOM state — no flash / hydration mismatch.
  const [isDark, setIsDark] = useState<boolean>(() =>
    document.documentElement.classList.contains('dark'),
  )

  const setDark = (dark: boolean) => {
    setIsDark(dark)
    applyDark(dark)
    localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light')
  }

  const toggleTheme = () => {
    setDark(!isDark)
  }

  // Follow the OS color-scheme preference ONLY while the user has not made an
  // explicit choice (no value stored under 'denarly_theme'). Once they toggle,
  // their stored choice wins and this listener becomes a no-op. We never write
  // to localStorage from here — that would pin a choice the user didn't make.
  useEffect(() => {
    if (!window.matchMedia) return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_STORAGE_KEY) !== null) return
      applyDark(e.matches)
      setIsDark(e.matches)
    }

    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, setDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
