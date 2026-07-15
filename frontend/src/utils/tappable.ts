import type { KeyboardEvent } from 'react'

/**
 * Button semantics for tap-to-open-action-sheet rows/cards (plan decision 7).
 * The rows are plain divs; without these props they're unreachable for
 * keyboard and screen-reader users on the touch devices they target.
 * Spread conditionally: `{...(isTouch ? tappableProps(fn) : {})}`.
 */
export function tappableProps(onTap: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onTap,
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onTap()
      }
    },
  }
}
