import { useMediaQuery } from './useMediaQuery'

// Canonical breakpoint tiers (IMPLEMENTATION_PLAN.md decision 1, spec docs/tasks/M1-*.md).
// Boundaries snap to Tailwind's `sm` (640px) and `lg` (1024px) screens so this hook and
// CSS prefixes (`max-sm:`, `lg:`) can never disagree at a boundary pixel.
export const MOBILE_QUERY = '(max-width: 639.98px)'
export const TABLET_QUERY = '(min-width: 640px) and (max-width: 1023.98px)'
export const DESKTOP_QUERY = '(min-width: 1024px)'

export interface Breakpoint {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

/** The single source of truth for "which device tier is this viewport". */
export function useBreakpoint(): Breakpoint {
  return {
    isMobile: useMediaQuery(MOBILE_QUERY),
    isTablet: useMediaQuery(TABLET_QUERY),
    isDesktop: useMediaQuery(DESKTOP_QUERY),
  }
}

/**
 * True on touch-primary devices regardless of viewport width (e.g. tablets in landscape).
 * Use for input-device concerns — hover reveals, hit areas — not for layout tiers.
 */
export function useIsTouch(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
