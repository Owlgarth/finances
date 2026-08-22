/**
 * Format a monetary value with comma (,) thousands separators and 2 decimal places.
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
  const formattedInt = newInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  const sign = isNegative ? '-' : ''
  const base = `${sign}${formattedInt}.${newDec}`
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
