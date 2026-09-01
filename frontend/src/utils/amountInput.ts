import { getNumberStyle } from './format'

/**
 * Normalize a user-typed amount string to the wire's dot-decimal shape.
 * Accepts both '.' and ',' as decimal separators, disambiguated by the
 * active number style (getNumberStyle) with typo tolerance; thousands
 * groups (the style's other separator) are stripped when strictly grouped.
 * Returns null for anything unparseable - scale (2-decimal) limits are NOT
 * enforced here; the existing validation pipeline owns them. Never called
 * per keystroke: normalize at the commit/submit boundary so the field keeps
 * what the user typed (the shown-RAW convention).
 *
 * Decision table (D = the active style's decimal separator, T = the other
 * one; whitespace is stripped first, an optional leading '-' is the sign):
 *   1. both separators present: the LAST occurrence is the decimal; T must
 *      form strict thousands groups (1-3 digits before its first
 *      occurrence, exactly 3 digits between/after), else null
 *   2. exactly one T: exactly 3 digits after it plus at least one before
 *      means thousands (strip it); anything else is read as the decimal
 *      separator (typo tolerance - "12,34" in the en style is 12.34)
 *   3. exactly one D: the decimal point (leading separator allowed, empty
 *      integer becomes '0', empty fraction drops the separator)
 *   4. multiple occurrences of one separator (the other absent): strict
 *      thousands groups all the way through strip them all (a paste from
 *      the other number format); anything else is null
 *   5. no separator: a plain integer
 * The assembled result must match /^-?\d{1,17}(\.\d+)?$/ - that final
 * check is what rejects e-notation and stray characters.
 */
export function normalizeAmountInput(raw: string): string | null {
  // Whitespace never carries meaning in an amount: strip plain spaces,
  // tabs, NBSP (U+00A0) and NNBSP (U+202F) - what grouped displays paste.
  // Escaped literals, never raw bytes (the invisible-character rule).
  const cleaned = raw.replace(/[\s\u00A0\u202F]/g, '')
  if (cleaned === '') return null

  // A single optional leading minus; a bare sign is not an amount.
  const negative = cleaned.startsWith('-')
  const body = negative ? cleaned.slice(1) : cleaned
  if (body === '') return null

  // Read the style per call: the preference can change while the app is
  // open, so the separator roles must never be captured at module load.
  const decimalSep = getNumberStyle() === 'eu' ? ',' : '.'
  const thousandsSep = decimalSep === '.' ? ',' : '.'

  const dotCount = countOccurrences(body, '.')
  const commaCount = countOccurrences(body, ',')

  let normalized: string

  if (dotCount > 0 && commaCount > 0) {
    // Both separators: the later occurrence wins as the decimal, and the
    // earlier one must be a strict thousands separator. Style-agnostic on
    // purpose, so a paste of either format parses the same way.
    const lastSepIdx = Math.max(body.lastIndexOf('.'), body.lastIndexOf(','))
    const integerRaw = body.slice(0, lastSepIdx)
    const fractionRaw = body.slice(lastSepIdx + 1)
    const groupingSep = body[lastSepIdx] === '.' ? ',' : '.'
    const groups = integerRaw.split(groupingSep)
    if (!isStrictGrouping(groups) || !/^\d*$/.test(fractionRaw)) return null
    const intPart = groups.join('') || '0'
    normalized = fractionRaw === '' ? intPart : `${intPart}.${fractionRaw}`
  } else if (countOccurrences(body, thousandsSep) === 1) {
    const tIdx = body.indexOf(thousandsSep)
    const before = body.slice(0, tIdx)
    const after = body.slice(tIdx + 1)
    if (isDigits(before) && /^\d{3}$/.test(after)) {
      // A strictly-shaped thousands group: strip it ("1,234" in the en
      // style is 1234, not 1.234).
      normalized = before + after
    } else {
      // Typo tolerance: a lone other-separator that is not a strict group
      // reads as the decimal separator ("1,5" typed in the en style).
      const asDecimal = applyAsDecimal(body, thousandsSep)
      if (asDecimal === null) return null
      normalized = asDecimal
    }
  } else if (countOccurrences(body, decimalSep) === 1) {
    const asDecimal = applyAsDecimal(body, decimalSep)
    if (asDecimal === null) return null
    normalized = asDecimal
  } else if (dotCount > 1 || commaCount > 1) {
    // One separator, several times, none of the other: every occurrence
    // must be part of a strict grouping ("1,234,567" / "1.234.567" in
    // either style - a cross-format paste). Ambiguous mixes are rejected
    // rather than guessed.
    const sep = dotCount > 1 ? '.' : ','
    const groups = body.split(sep)
    if (!isStrictGrouping(groups)) return null
    normalized = groups.join('')
  } else {
    // No separator at all: a plain integer (the final shape check below
    // still rejects stray letters and e-notation).
    normalized = body
  }

  const signed = negative ? `-${normalized}` : normalized
  return finalShape.test(signed) ? signed : null
}

/**
 * normalizeAmountInput + Number: a parseFloat replacement that cannot
 * silently truncate at a comma (parseFloat("1,5") === 1). null when
 * unparseable. Floats are for magnitude checks and display only - never
 * for money that gets persisted (the exact-math helpers in utils/format.ts
 * own that).
 */
export function parseAmountNumber(raw: string): number | null {
  const normalized = normalizeAmountInput(raw)
  return normalized === null ? null : Number(normalized)
}

/** The wire's amount shape: an integer of at most 17 digits (the backend
 *  Decimal field's ceiling) with an optional fraction. */
const finalShape = /^-?\d{1,17}(\.\d+)?$/

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

const isDigits = (s: string): boolean => /^\d+$/.test(s)

/** Strict thousands grouping of a separator-split integer part: digits
 *  only, 1-3 before the first occurrence, exactly 3 between/after every
 *  occurrence. */
function isStrictGrouping(groups: string[]): boolean {
  if (groups.length === 0 || !groups.every(isDigits)) return false
  const [first, ...rest] = groups
  return first.length >= 1 && first.length <= 3 && rest.every((g) => g.length === 3)
}

/** Read `body` (containing exactly one occurrence of `sep`) as decimal
 *  notation: an empty integer defaults to '0', an empty fraction drops the
 *  separator. null when either side holds non-digits. */
function applyAsDecimal(body: string, sep: string): string | null {
  const [integerRaw = '', fractionRaw = ''] = body.split(sep)
  if (!/^\d*$/.test(integerRaw) || !/^\d*$/.test(fractionRaw)) return null
  const intPart = integerRaw || '0'
  return fractionRaw === '' ? intPart : `${intPart}.${fractionRaw}`
}
