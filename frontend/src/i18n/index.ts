import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import registry from '../../../backend/common/languages.json'

/** Fixed namespace list (shared i18n conventions). Mirrors locales/en/. */
export const NAMESPACES = [
  'auth',
  'nav',
  'accounts',
  'transfers',
  'budgets',
  'transactions',
  'planned',
  'dashboard',
  'members',
  'settings',
  'common',
  'numbers',
] as const

export const LANGUAGE_CODES: string[] = registry.languages.map((l) => l.code)
export const DEFAULT_LANGUAGE: string = registry.defaultLanguage
export const DEFAULT_NUMBER_FORMAT: string = registry.defaultNumberFormat

// Eager glob: all catalogs are inlined at build time, so init below is
// synchronous and no request can render before translations exist.
const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>

const resources: Record<string, Record<string, Record<string, unknown>>> = {}
for (const [path, mod] of Object.entries(modules)) {
  // path looks like './locales/en/auth.json'
  const match = path.match(/^\.\/locales\/([^/]+)\/([^/]+)\.json$/)
  if (!match) continue
  const [, lang, ns] = match
  resources[lang] = resources[lang] ?? {}
  resources[lang][ns] = mod.default
}

void i18next
  .use(initReactI18next)
  .use(LanguageDetector)
  .init({
    resources,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGE_CODES,
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: {
      // React already escapes interpolated values.
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'owlgarth_language',
      caches: ['localStorage'],
    },
  })

// Detection has run: keep <html lang> in sync with the resolved language.
// The FOUC script in index.html only knows the localStorage choice, so a
// first visit detected from navigator settings would otherwise keep the
// hardcoded lang="en" while the UI renders in the detected language.
document.documentElement.lang = i18next.resolvedLanguage ?? DEFAULT_LANGUAGE

export default i18next
