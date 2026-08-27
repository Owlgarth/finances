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
