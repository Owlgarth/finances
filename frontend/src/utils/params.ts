// URL-search-param helpers shared by the list pages (Transactions, Planned,
// Transfers): strict readers for ?query values, the patch semantics for
// updating them, and the stale-page reconciliation every paginated list uses.

import { useEffect } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import type { PaginatedResponse } from '../types'

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

/**
 * Reconciles a stale ?page= once the response proves it out of range: the
 * page param is reset to 1 through the same updater a page-chip click uses,
 * so reload and back/forward bookkeeping match the rows on screen. The
 * backend already serves the last valid page for an out-of-range request,
 * so this only syncs the URL.
 *
 * The trigger is total_pages, never the response's returned page: with
 * keepPreviousData the previous page's response is still mounted while the
 * next one loads, and its returned page sits below the requested one on
 * every forward navigation - comparing against it would yank every "next"
 * click back to page 1. max(total_pages, 1) mirrors the backend clamp, so an
 * empty list also reads as page 1. The reset lands on page 1 (not
 * total_pages) because filter changes already reset to page 1 via
 * createUpdateParams - one consistent landing spot, and 1 stays valid
 * however far the list shrank.
 */
export function useStalePageReset(
  page: number,
  data: PaginatedResponse<unknown> | undefined,
  updateParams: (patch: ParamPatch) => void,
) {
  useEffect(() => {
    if (data && page > Math.max(data.total_pages, 1)) updateParams({ page: 1 })
  }, [page, data, updateParams])
}
