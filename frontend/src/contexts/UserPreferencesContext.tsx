import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../api/client'
import { useAuth } from './AuthContext'
import type { UserPreferences } from '../types'
import fontsRegistry from '../../../backend/common/fonts.json'

const FONT_STACKS: Record<string, string> = Object.fromEntries(
  fontsRegistry.fonts.map((f) => [f.code, f.cssStack]),
)

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
  const fontFamily = preferences?.font_family ?? fontsRegistry.defaultFont

  useEffect(() => {
    const fontStack = FONT_STACKS[fontFamily] || FONT_STACKS[fontsRegistry.defaultFont]
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
