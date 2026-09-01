import { format, parseISO } from 'date-fns'
import { enUS, type Locale } from 'date-fns/locale'

/**
 * Module-level formatting configuration (setAuthToken precedent: an external
 * store with a setter, no React state). LanguageContext applies it on init,
 * on language/number-format changes, and when authenticated preferences
 * arrive (server wins).
 *
 * numberStyle drives digit separators in formatAmount/formatPeriodRange:
 *   'en' -> grouping ','  decimal '.'   (byte-identical to the previous behavior)
 *   'eu' -> grouping NBSP decimal ','   (NBSP written as the escaped literal
 *          '\u00A0' per the invisible-character rule; never a raw 0xC2 0xA0 byte)
 * dateLocale supplies month names for formatPeriodRange's display patterns.
 */
export interface FormattingConfig {
  numberStyle: 'en' | 'eu'
  dateLocale: Locale
}

let formattingConfig: FormattingConfig = { numberStyle: 'en', dateLocale: enUS }

export function configureFormatting(cfg: FormattingConfig): void {
  formattingConfig = cfg
}

/** Read-only separator-style lookup for number rendering outside
 *  formatAmount (e.g. compact chart-axis formatters) - does not weaken the
 *  singleton. */
export function getNumberStyle(): FormattingConfig['numberStyle'] {
  return formattingConfig.numberStyle
}

/**
 * Format a monetary value with thousands and decimal separators per the
 * configured numberStyle ('en': 1,234.56; 'eu': 1\u00A0234,56), 2 decimal places.
 *
 * Accepts the raw Decimal string from the backend (precision-safe for large
 * values like "123456789012345.67") or a number. Negatives render with a
 * leading minus sign.
 *
 * Currency is a display concern handled at the call site (symbol after the
 * number, space-separated). Pass `currency` only when you want it appended to
 * the formatted string; otherwise render it as a separate element.
 */
export function formatAmount(value: string | number, currency?: string): string {
  // String-based formatting preserves full Decimal precision from the backend
  // and avoids parseFloat, which loses precision for large values. Rounding to
  // 2 decimals uses integer (BigInt) arithmetic so a 3rd-digit carry propagates
  // correctly (e.g. 9.999 -> 10.00) without floating-point error.
  const total = String(value)
  const isNegative = total.startsWith('-')
  const abs = isNegative ? total.slice(1) : total
  const [rawInt, decPart = ''] = abs.split('.')
  const intPart = rawInt || '0'

  // Keep 2 decimals; inspect the 3rd to decide rounding (padEnd so a short/no
  // decimal part still yields a 3rd digit to test, defaulting to "no round up").
  const decPadded = decPart.padEnd(3, '0').slice(0, 3)
  const keep = decPadded.slice(0, 2)
  const roundUp = decPadded[2] >= '5'

  // combined = intPart concatenated with the 2 kept decimals (the value × 100 as an integer string).
  let combined = intPart + keep
  if (roundUp) {
    combined = String(BigInt(combined) + 1n)
  }
  // Ensure at least 3 digits (one integer + two decimals) so the split below is
  // correct even when a carry shortens the string (e.g. 0.009 -> combined "1" -> "001" -> "0.01").
  combined = combined.padStart(3, '0')

  const newDec = combined.slice(-2)
  const newInt = combined.slice(0, -2) || '0'
  const groupingSeparator = formattingConfig.numberStyle === 'eu' ? '\u00A0' : ','
  const decimalSeparator = formattingConfig.numberStyle === 'eu' ? ',' : '.'
  const formattedInt = newInt.replace(/\B(?=(\d{3})+(?!\d))/g, groupingSeparator)

  const sign = isNegative ? '-' : ''
  const base = `${sign}${formattedInt}${decimalSeparator}${newDec}`
  return currency ? `${base} ${currency}` : base
}

/**
 * Parse a money string into signed integer cents (BigInt), rounding half-up
 * beyond 2 decimals — the same 3rd-digit rule formatAmount applies for
 * display. String/BigInt only, no parseFloat: backend Decimals up to 17
 * digits (see formatAmount's doc comment) keep exact cents.
 */
function toCents(value: string | number): bigint {
  const total = String(value)
  const isNegative = total.startsWith('-')
  const abs = isNegative ? total.slice(1) : total
  const [rawInt, decPart = ''] = abs.split('.')
  const intPart = rawInt || '0'
  // Same 3rd-digit round-up idiom as formatAmount.
  const decPadded = decPart.padEnd(3, '0').slice(0, 3)
  const roundUp = decPadded[2] >= '5'
  const cents = BigInt(intPart + decPadded.slice(0, 2)) + (roundUp ? 1n : 0n)
  return isNegative ? -cents : cents
}

/**
 * Exact decimal subtraction of two money strings: a - b, as a 2-decimal
 * string. e.g. subtractAmounts('10.00', '12.50') === '-2.50',
 * subtractAmounts('10', '10') === '0.00'. For persisted deltas computed from
 * backend Decimal strings — never parseFloat (money rule, see formatAmount).
 * Inputs with more than 2 decimals round half-up via toCents.
 */
export function subtractAmounts(a: string, b: string): string {
  const diff = toCents(a) - toCents(b)
  const isNegative = diff < 0n
  const abs = (isNegative ? -diff : diff).toString().padStart(3, '0')
  return `${isNegative ? '-' : ''}${abs.slice(0, -2) || '0'}.${abs.slice(-2)}`
}

/**
 * Name a custom budget period from its ISO date range (yyyy-MM-dd):
 * "04 Sep – 03 Oct 2026" — zero-padded days, abbreviated months, en dash.
 * Mirrors the backend's derived-period naming (budgeting/services.py,
 * PeriodService.compute_range: f'{start:%d %b} – {end:%d %b %Y}') so
 * hand-created custom periods read like derived weeks-cadence ones.
 * parseISO reads date-only strings as local time — no UTC-midnight day
 * shift in negative-offset zones (unlike new Date('yyyy-mm-dd')).
 *
 * configureFormatting deliberately has no effect on this function: its
 * output is persisted as period.name and must stay byte-identical to the
 * backend mirror regardless of the active number style or date locale.
 */
export function formatPeriodName(startIso: string, endIso: string): string {
  return `${format(parseISO(startIso), 'dd MMM')} – ${format(parseISO(endIso), 'dd MMM y')}`
}

/**
 * Format a period's date range for the PeriodPicker rows (and any other short
 * period-range display): "Apr 1 - Apr 30" within one year, "Dec 28 2025 -
 * Jan 3 2026" across years (en style); "01.04 - 30.04" / "28.12.2025 -
 * 03.01.2026" (eu style).
 *
 * Style- and locale-aware: the separator style comes from the module-level
 * formatting config, and month names follow the configured date-fns locale
 * (passed unconditionally, so any shape containing name tokens localizes
 * with the UI language; eu shapes are numeric).
 *
 * Worked examples (these docblock examples are the contract for the en
 * shapes - the frontend has no test runner, so they are the review
 * reference; keep them in sync if the formats ever change):
 *   en style (default):
 *     formatPeriodRange('2026-04-01', '2026-04-30') === 'Apr 1 - Apr 30'
 *     formatPeriodRange('2028-02-01', '2028-02-29') === 'Feb 1 - Feb 29'
 *     formatPeriodRange('2026-01-05', '2026-01-11') === 'Jan 5 - Jan 11'
 *     formatPeriodRange('2025-12-28', '2026-01-03') === 'Dec 28 2025 - Jan 3 2026'
 *     formatPeriodRange('2026-11-15', '2027-02-28') === 'Nov 15 2026 - Feb 28 2027'
 *     formatPeriodRange('2026-07-01', '2026-09-30', { withYears: true })
 *       === 'Jul 1 2026 - Sep 30 2026'
 *   eu style (configureFormatting({ numberStyle: 'eu', ... }) active):
 *     formatPeriodRange('2026-04-01', '2026-04-30') === '01.04 - 30.04'
 *     formatPeriodRange('2025-12-28', '2026-01-03') === '28.12.2025 - 03.01.2026'
 *     formatPeriodRange('2026-07-01', '2026-09-30', { withYears: true })
 *       === '01.07.2026 - 30.09.2026'
 *
 * ADJACENCY WARNING - deliberately different from formatPeriodName above,
 * which mirrors the backend's derived-period naming (zero-padded days, an
 * en-dash separator, year only on the end, e.g. "04 Sep" en-dash "03 Oct
 * 2026") and must stay byte-identical to it (hand-created periods persist it
 * as their name). Do NOT unify the two formats. This one is a display-only
 * context-selector range: month-first, no leading zeros, year on
 * BOTH endpoints or neither, regular hyphen " - " separator, no same-month
 * compression - same function, style-aware since the number-format
 * preference exists (the eu style changes the date shapes only; the " - "
 * separator itself stays in both styles).
 *
 * parseISO reads date-only strings as local time - no UTC-midnight day shift
 * in negative-offset zones (see formatPeriodName's note).
 */
export function formatPeriodRange(
  startIso: string,
  endIso: string,
  opts?: { withYears?: boolean },
): string {
  const withYears = opts?.withYears === true || startIso.slice(0, 4) !== endIso.slice(0, 4)
  const { numberStyle, dateLocale } = formattingConfig
  const pattern = numberStyle === 'eu'
    ? (withYears ? 'dd.MM.yyyy' : 'dd.MM')
    : (withYears ? 'MMM d y' : 'MMM d')
  return `${format(parseISO(startIso), pattern, { locale: dateLocale })} - ${format(parseISO(endIso), pattern, { locale: dateLocale })}`
}
