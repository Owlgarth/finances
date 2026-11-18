import { useMediaQuery } from './useMediaQuery'

// Canonical breakpoint tiers (see design/responsive.md for the tier contract).
// Boundaries snap to Tailwind's `sm` (640px), `lg` (1024px) and `xl` (1280px)
// screens so this hook and CSS prefixes (`max-sm:`, `lg:`, `xl:`) can never
// disagree at a boundary pixel. Four tiers: isWide OVERLAPS isDesktop by
// design - 1280+ is both (a wide carve-out of desktop), while isMobile,
// isTablet and isDesktop partition the rest. isWide exists so layout defaults
// can differ across the 1280 boundary (the full sidebar below it would starve
// the record list beside a side panel). responsive.md's three-tier table
// predates the wide tier; this comment is the interim contract until the
// doc catches up.
export const MOBILE_QUERY = '(max-width: 639.98px)'
export const TABLET_QUERY = '(min-width: 640px) and (max-width: 1023.98px)'
export const DESKTOP_QUERY = '(min-width: 1024px)'
export const WIDE_QUERY = '(min-width: 1280px)'

export interface Breakpoint {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isWide: boolean
}

/** The single source of truth for "which device tier is this viewport". */
export function useBreakpoint(): Breakpoint {
  return {
    isMobile: useMediaQuery(MOBILE_QUERY),
    isTablet: useMediaQuery(TABLET_QUERY),
    isDesktop: useMediaQuery(DESKTOP_QUERY),
    isWide: useMediaQuery(WIDE_QUERY),
  }
}

/**
 * True on touch-primary devices regardless of viewport width (e.g. tablets in landscape).
 * Use for input-device concerns — hover reveals, hit areas — not for layout tiers.
 */
export function useIsTouch(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
