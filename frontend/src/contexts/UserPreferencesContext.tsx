import { createContext, useContext, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authApi } from '../api/client'
import { useAuth } from './AuthContext'
import type { UserPreferences } from '../types'

interface UserPreferencesContextType {
  preferences: UserPreferences | null
  calendarStartDay: number
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

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences: preferences || null,
        calendarStartDay,
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
