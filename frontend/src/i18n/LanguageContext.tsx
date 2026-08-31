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
import { configureFormatting } from '../utils/format'
import { getDateLocale } from './dateLocales'
import registry from '../../../backend/common/languages.json'

export const LANGUAGE_STORAGE_KEY = 'owlgarth_language'
const NUMBER_FORMAT_STORAGE_KEY = 'owlgarth_number_format'

/** Separator style for a number-format preference code. */
type NumberStyle = 'en' | 'eu'

/*
 * Number-style value-source precedence: authenticated
 * preferences.number_format (server, when the query has data) >
 * localStorage['owlgarth_number_format'] > registry defaultNumberFormat.
 * resolveNumberStyle implements the local half; the preferences effect
 * threads the server value in explicitly.
 */
function resolveNumberStyle(serverValue: string | null | undefined): NumberStyle {
  const raw = serverValue ?? localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY) ?? registry.defaultNumberFormat
  return raw === 'eu' ? 'eu' : 'en'
}

/** Push language + number style into the module-level formatting config. */
function applyFormatting(language: string, numberStyle: NumberStyle): void {
  configureFormatting({ numberStyle, dateLocale: getDateLocale(language) })
}

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

  // Synchronous initial application of the module-level formatting config
  // (setAuthToken precedent) so the first render is already styled. Runs on
  // every provider render; the write is idempotent, and the setters below
  // re-apply on change.
  applyFormatting(language, resolveNumberStyle(numberFormat))

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
    applyFormatting(code, resolveNumberStyle(numberFormat))
  }, [numberFormat])

  const setNumberFormat = useCallback((code: string) => {
    localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, code)
    setNumberFormatState(code)
    applyFormatting(language, resolveNumberStyle(code))
  }, [language])

  // Server preference wins on first load after authentication (silent, no
  // PATCH). Effect bodies stay lint-quiet by delegating to the exposed
  // event-handler callbacks (setLanguage/setNumberFormat) instead of raw
  // setState; the refs stop re-application after a manual in-session switch
  // (preferences?.language / ?.number_format do not change then).
  const { data: preferences } = useQuery<UserPreferences>({
    queryKey: ['user-preferences'],
    queryFn: () => authApi.getPreferences(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  })
  const appliedServerLanguage = useRef<string | null>(null)
  const appliedServerNumberFormat = useRef<string | null>(null)
  useEffect(() => {
    // Server preference wins for the number style whenever the query has
    // data (resolveNumberStyle's precedence chain); on logout preferences
    // is undefined and the locally stored value applies again through the
    // provider-mount application above. Runs before the language guard so
    // a number_format-only server change still lands.
    applyFormatting(
      i18next.resolvedLanguage || registry.defaultLanguage,
      resolveNumberStyle(preferences?.number_format),
    )
    const serverLanguage = preferences?.language
    if (!serverLanguage || appliedServerLanguage.current === serverLanguage) return
    appliedServerLanguage.current = serverLanguage
    if (i18next.resolvedLanguage !== serverLanguage) {
      void setLanguage(serverLanguage)
    }
    // Server number_format wins the same way the language does. Going through
    // setNumberFormat (not just the module config above) is load-bearing:
    // mutating the singleton alone re-renders nothing, so a cold authenticated
    // load would keep painting the first render's localStorage/default style.
    // The microtask defers the setState out of the effect body (the frozen
    // set-state-in-effect baseline; the async setLanguage seam above gets the
    // same deferral from its await). The ref stops re-application after a
    // manual in-session switch.
    const serverNumberFormat = preferences?.number_format
    if (serverNumberFormat && appliedServerNumberFormat.current !== serverNumberFormat) {
      appliedServerNumberFormat.current = serverNumberFormat
      if (serverNumberFormat !== numberFormat) {
        void Promise.resolve().then(() => setNumberFormat(serverNumberFormat))
      }
    }
  }, [preferences?.language, preferences?.number_format, setLanguage, setNumberFormat, numberFormat])

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
