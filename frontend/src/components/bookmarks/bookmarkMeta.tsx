import {
  Bookmark, Calendar, Car, Coffee, Coins, Gift, GraduationCap, HeartPulse, Home, Landmark,
  Plane, PiggyBank, ShoppingBag, ShoppingCart, Utensils, Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Bookmark as BookmarkModel } from '../../types'

/** Single registry every bookmark surface resolves glyphs from (sidebar,
    More sheet, modal picker grid, manage page). Stored on the bookmark as the
    kebab key; unknown keys fall back to the Bookmark icon. */
export const BOOKMARK_ICONS: Record<string, LucideIcon> = {
  bookmark: Bookmark,
  wallet: Wallet,
  'piggy-bank': PiggyBank,
  plane: Plane,
  car: Car,
  cart: ShoppingCart,
  'shopping-bag': ShoppingBag,
  utensils: Utensils,
  coffee: Coffee,
  home: Home,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  gift: Gift,
  landmark: Landmark,
  calendar: Calendar,
  coin: Coins,
}

/** Picker-grid order (the map's insertion order). Derived from the map so the
    key list and the registry can never drift apart. */
export const BOOKMARK_ICON_KEYS: readonly string[] = Object.keys(BOOKMARK_ICONS)

/** Lucide component for a stored icon key, with Bookmark as the fallback. */
export function bookmarkIcon(key: string | null): LucideIcon {
  return (key !== null && BOOKMARK_ICONS[key]) || Bookmark
}

/** Swatch palette order. Colors are stored as these KEYS, never hex values -
    the palette lives once in index.css as --bookmark-c-<key> variables with
    dark overrides, resolved per theme by the CSS cascade. */
export const BOOKMARK_COLOR_KEYS: readonly string[] = [
  'neutral', 'positive', 'negative', 'warning', 'blue',
  'violet', 'pink', 'cyan', 'teal', 'indigo',
]

/** CSS color expression for a stored swatch key. Unknown/null keys fall back
    to muted text so a stale key still renders a visible glyph. */
export function bookmarkColorVar(key: string | null): string {
  return key !== null && BOOKMARK_COLOR_KEYS.includes(key)
    ? `var(--bookmark-c-${key})`
    : 'var(--color-text-muted)'
}

/** A bookmark's lucide glyph in its swatch color - the one rendering shape
    shared by every bookmark surface (nav rows, sheet rows, picker preview,
    manage tiles). strokeWidth passes through untouched when given (the More
    sheet renders 1.5; sidebar rows and pickers use the lucide default). */
export function BookmarkGlyph({ bookmark, size, strokeWidth, className }: {
  bookmark: Pick<BookmarkModel, 'icon' | 'color'>
  size: number
  strokeWidth?: number
  /** Appended AFTER the baked flex-shrink-0 default - component defaults
      live inside the component; the passthrough covers surface-specific
      additions without forking the shape. */
  className?: string
}) {
  // Direct map lookup, not the bookmarkIcon() call: react-hooks/static-components
  // cannot see that the call only RETURNS an existing module-scope component, so
  // it reads as a component created during render (the TYPE_ICON row lookup in
  // AccountsPage is the sanctioned member-expression shape).
  const Icon = (bookmark.icon !== null && BOOKMARK_ICONS[bookmark.icon]) || Bookmark
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={`flex-shrink-0${className ? ` ${className}` : ''}`}
      style={{ color: bookmarkColorVar(bookmark.color) }}
    />
  )
}
