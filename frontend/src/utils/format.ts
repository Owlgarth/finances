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
