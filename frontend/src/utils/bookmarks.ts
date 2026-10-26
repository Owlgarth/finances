// Pure helpers for personal bookmarks: turning a stored bookmark into the
// route it opens, deciding whether the current location IS that route, and
// converting the pages' URL search params to/from the stored params dict.

import type { Bookmark } from '../types'

// One encoding of the route shape feeds both directions: the path a bookmark
// navigates to and the location facts the active-state helper compares
// against can never disagree.
function bookmarkRoute(b: Bookmark): { pathname: string; params: Record<string, string> } {
  if (b.kind === 'budget') {
    return {
      pathname: `/budgets/${b.budget_id}`,
      params: b.currency_code === null ? {} : { currency: b.currency_code },
    }
  }
  return { pathname: `/${b.kind}`, params: b.params }
}

/** Route string for a NavLink `to`: a budget bookmark opens the budget page
    seeded with its currency; a filter bookmark replays its saved params
    (empty params = the plain, unfiltered page). */
export function bookmarkTargetPath(b: Bookmark): string {
  const { pathname, params } = bookmarkRoute(b)
  const search = new URLSearchParams(params).toString()
  return search === '' ? pathname : `${pathname}?${search}`
}

/**
 * Whether the current location is the bookmark's saved view: the pathname
 * must match exactly AND every captured param must be present and equal.
 * Params the page adds on its own (?period=, ?page=) are ignored, and a
 * budget bookmark compares only pathname + the currency param (period flips
 * keep it active). NavLink's own isActive matches pathname only - it would
 * light up every /transactions bookmark together - so drive styling from
 * THIS helper inside the NavLink className callback.
 */
export function bookmarkIsActive(b: Bookmark, location: { pathname: string; search: string }): boolean {
  const target = bookmarkRoute(b)
  if (location.pathname !== target.pathname) return false
  const current = new URLSearchParams(location.search)
  return Object.entries(target.params).every(([key, value]) => current.get(key) === value)
}

/** Capture side: the page's search params as a bookmark's params dict.
    `page` is dropped - pagination is where-you-are, not a saved filter. */
export function paramsFromSearchParams(sp: URLSearchParams): Record<string, string> {
  const params = Object.fromEntries(sp)
  delete params.page
  return params
}

/** How many saved params carry a value - the filter-count summaries show.
    An empty string filters nothing, so it does not count. */
export function countActiveFilters(params: Record<string, string>): number {
  return Object.values(params).filter((value) => value !== '').length
}
