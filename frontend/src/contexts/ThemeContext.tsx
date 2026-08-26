import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

const THEME_STORAGE_KEY = 'owlgarth_theme'

interface ThemeContextType {
  isDark: boolean
  toggleTheme: () => void
  setDark: (dark: boolean) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// Must match the theme-color metas in index.html (--color-background in both themes).
const THEME_COLOR = { light: '#FAFAFA', dark: '#0A0A0A' } as const

function applyDark(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark)
  // Sync browser/PWA chrome with the *app* theme. The static meta in
  // index.html is light-only; writing it here makes browser/PWA chrome match
  // the app theme once the user toggles.
  const color = isDark ? THEME_COLOR.dark : THEME_COLOR.light
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute('content', color))
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialize from the class the FOUC script (index.html) already set on <html>
  // before React rendered. Guarantees the first React paint matches the actual
  // DOM state — no flash / hydration mismatch.
  const [isDark, setIsDark] = useState<boolean>(() =>
    document.documentElement.classList.contains('dark'),
  )

  // Re-apply on mount: the FOUC script only sets the <html> class, so a stored
  // dark choice needs its theme-color synced here.
  useEffect(() => {
    applyDark(isDark)
  }, [isDark])

  const setDark = (dark: boolean) => {
    setIsDark(dark)
    applyDark(dark)
    localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light')
  }

  const toggleTheme = () => {
    setDark(!isDark)
  }

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
