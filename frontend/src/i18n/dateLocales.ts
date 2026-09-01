import { enUS, pl, uk } from 'date-fns/locale'
import type { Locale } from 'date-fns/locale'
import registry from '../../../backend/common/languages.json'

// Explicit imports: when a language is added to backend/common/languages.json,
// its date-fns locale import must be added here by hand.
const IMPORTED_LOCALES: Record<string, Locale> = { enUS, uk, pl }

/** Registry dateFnsLocale name -> date-fns Locale object. */
export const DATE_LOCALES: Record<string, Locale> = Object.fromEntries(
  registry.languages.map((l) => [l.dateFnsLocale, IMPORTED_LOCALES[l.dateFnsLocale]]),
)

/** Locale for a UI language code ('uk' -> date-fns uk), falling back to enUS. */
export function getDateLocale(langCode: string): Locale {
  const entry = registry.languages.find((l) => l.code === langCode)
  return (entry && DATE_LOCALES[entry.dateFnsLocale]) || enUS
}
