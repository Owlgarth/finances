import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../api/client'
import { useAuth } from './AuthContext'
import type { UserPreferences } from '../types'

const FONT_MAP: Record<string, string> = {
  geist: "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  roboto: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  lato: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

interface UserPreferencesContextType {
  preferences: UserPreferences | null
  calendarStartDay: number
  fontFamily: string
  isLoading: boolean
}

const UserPreferencesContext = createContext<UserPreferencesContextType | undefined>(undefined)

export function UserPreferencesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()

  const { data: preferences, isLoading } = useQuery<UserPreferences>({
    queryKey: ['user-preferences'],
    queryFn: () => authApi.getPreferences(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  })

  const calendarStartDay = preferences?.calendar_start_day ?? 7
  const fontFamily = preferences?.font_family ?? 'geist'

  useEffect(() => {
    const fontStack = FONT_MAP[fontFamily] || FONT_MAP.geist
    document.documentElement.style.setProperty('--font-family', fontStack)
    document.body.style.fontFamily = fontStack
  }, [fontFamily])

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences: preferences || null,
        calendarStartDay,
        fontFamily,
        isLoading,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  )
}

export function useUserPreferences() {
  const context = useContext(UserPreferencesContext)
  if (!context) {
    throw new Error('useUserPreferences must be used within UserPreferencesProvider')
  }
  return context
}
