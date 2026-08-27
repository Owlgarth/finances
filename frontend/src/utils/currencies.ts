import type { CatalogCurrency } from '../types'

/** Active currency codes for a budget view: the configured set in stored
 *  order (first = default view), then data-only codes (present in summary
 *  items but not configured) in enabled-currency order, then any remaining
 *  data codes not in the enabled list. Empty config + empty data falls back
 *  to [fallback]: the caller passes the FIRST entry of the enabled-currencies
 *  list, which the backend returns in creation order with the workspace's
 *  primary currency first - deterministic, never alphabetical. */
export function activeCurrencyCodes(
  configured: string[],
  items: { currency_code: string }[],
  enabled: string[],
  fallback: string,
): string[] {
  const present = new Set(items.map((i) => i.currency_code))
  const dataOnly = enabled.filter((code) => present.has(code) && !configured.includes(code))
  for (const code of present) {
    if (!configured.includes(code) && !dataOnly.includes(code)) dataOnly.push(code)
  }
  const ordered = [...configured, ...dataOnly]
  return ordered.length > 0 ? ordered : [fallback]
}

/** Curated currency list for pre-workspace forms (register, account reset):
 *  these flows run before an authenticated enabled-currencies query exists,
 *  so the picker reads this static list; the server validates every code
 *  against the seeded catalog. PLN first - the preselected primary. Ids are
 *  synthetic indices that only satisfy the CatalogCurrency type; the picker
 *  reads just code and name.
 *  Synced with backend currencies/data.py ISO_4217 - names, symbols, and
 *  decimals mirror the catalog rows the server validates against. */
export const PRE_AUTH_CURRENCIES: CatalogCurrency[] = [
  { id: 0, code: 'PLN', name: 'Polish Zloty', symbol: 'zł', decimals: 2, is_custom: false },
  { id: 1, code: 'EUR', name: 'Euro', symbol: '€', decimals: 2, is_custom: false },
  { id: 2, code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2, is_custom: false },
  { id: 3, code: 'GBP', name: 'British Pound Sterling', symbol: '£', decimals: 2, is_custom: false },
  { id: 4, code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴', decimals: 2, is_custom: false },
  { id: 5, code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimals: 2, is_custom: false },
  { id: 6, code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', decimals: 2, is_custom: false },
  { id: 7, code: 'SEK', name: 'Swedish Krona', symbol: 'kr', decimals: 2, is_custom: false },
  { id: 8, code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', decimals: 2, is_custom: false },
  { id: 9, code: 'DKK', name: 'Danish Krone', symbol: 'kr', decimals: 2, is_custom: false },
  { id: 10, code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimals: 2, is_custom: false },
  { id: 11, code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2, is_custom: false },
  { id: 12, code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0, is_custom: false },
]
