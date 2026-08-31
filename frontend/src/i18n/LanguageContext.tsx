import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import i18next from 'i18next'
import { authApi, setApiLanguage } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import type { UserPreferences } from '../types'
import registry from '../../../backend/common/languages.json'

export const LANGUAGE_STORAGE_KEY = 'owlgarth_language'
const NUMBER_FORMAT_STORAGE_KEY = 'owlgarth_number_format'

interface LanguageContextType {
  language: string
  numberFormat: string
  setLanguage: (code: string) => Promise<void>
  setNumberFormat: (code: string) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()

  // Seed from the already-initialized i18next instance: main.tsx imports
  // ./i18n before render, so detection has run by now. resolvedLanguage is
  // always a registry code (supportedLngs + fallback); i18next.language can
  // be an unsupported navigator code, so it is only the second fallback.
  const [language, setLanguageState] = useState(
    () => i18next.resolvedLanguage || i18next.language || registry.defaultLanguage,
  )
  const [numberFormat, setNumberFormatState] = useState(
    () => localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY) || registry.defaultNumberFormat,
  )

  // i18next is an external store: state updates arrive through its
  // languageChanged event (a subscription callback, not an effect-body
  // setter), which keeps react-hooks/set-state-in-effect quiet.
  useEffect(() => {
    const onChange = () => setLanguageState(i18next.resolvedLanguage || registry.defaultLanguage)
    i18next.on('languageChanged', onChange)
    return () => {
      i18next.off('languageChanged', onChange)
    }
  }, [])

  const setLanguage = useCallback(async (code: string) => {
    await i18next.changeLanguage(code)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
    document.documentElement.lang = i18next.resolvedLanguage || code
    setApiLanguage(code)
    // Number/date formatting configuration (configureFormatting in
    // utils/format) does not exist yet; when it does, this is where it gets
    // called with the number style and date locale.
  }, [])

  const setNumberFormat = useCallback((code: string) => {
    localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, code)
    setNumberFormatState(code)
    // configureFormatting({ numberStyle: code }) will be called here once
    // formatting configuration exists in utils/format.
  }, [])

  // Server preference wins on first load after authentication (silent, no
  // PATCH). Deliberate shape: the effect calls ONLY external mutators -
  // i18next/localStorage/axios - never setState, so it cannot add a
  // set-state-in-effect warning; the ref stops re-application after a manual
  // in-session switch (preferences?.language does not change then).
  const { data: preferences } = useQuery<UserPreferences>({
    queryKey: ['user-preferences'],
    queryFn: () => authApi.getPreferences(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  })
  const appliedServerLanguage = useRef<string | null>(null)
  useEffect(() => {
    const serverLanguage = preferences?.language
    if (!serverLanguage || appliedServerLanguage.current === serverLanguage) return
    appliedServerLanguage.current = serverLanguage
    if (i18next.resolvedLanguage !== serverLanguage) {
      void setLanguage(serverLanguage)
    }
    // numberFormat stays a local (localStorage) preference for now; it
    // becomes server-synced once it is user-editable in the profile form.
    // Persist the server value for next mount.
    if (preferences?.number_format) {
      localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, preferences.number_format)
    }
  }, [preferences?.language, preferences?.number_format, setLanguage])

  const value = useMemo(
    () => ({ language, numberFormat, setLanguage, setNumberFormat }),
    [language, numberFormat, setLanguage, setNumberFormat],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
