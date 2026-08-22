// URL-search-param helpers shared by the list pages (Transactions, Planned):
// strict readers for ?query values and the patch semantics for updating them.

import type { SetURLSearchParams } from 'react-router-dom'

/** Positive int URL param or null (garbage and <=0 read as unset). */
export function intParam(params: URLSearchParams, key: string): number | null {
  const n = Number(params.get(key))
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Comma-separated int list URL param (garbage entries dropped). */
export function intListParam(params: URLSearchParams, key: string): number[] {
  const raw = params.get(key)
  if (!raw) return []
  return raw
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
}

/** Amount param → number for the API, or undefined when unset/garbage. */
export function amountParam(raw: string): number | undefined {
  if (raw === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/** One filter patch: arrays join to CSV, null/'' deletes the key. */
export type ParamPatch = Record<string, string | number | (string | number)[] | null>

/** URL-param updater for list-page filters. Any patch that doesn't set 'page'
    explicitly resets pagination — a changed filter invalidates the page. */
export function createUpdateParams(setSearchParams: SetURLSearchParams): (patch: ParamPatch) => void {
  return (patch) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!('page' in patch)) next.delete('page')
        for (const [key, value] of Object.entries(patch)) {
          const str = Array.isArray(value) ? value.join(',') : value
          if (str === null || str === '') next.delete(key)
          else next.set(key, String(str))
        }
        return next
      },
      { replace: true },
    )
  }
}
