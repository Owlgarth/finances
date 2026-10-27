// Per-user page defaults: resolve the member-settings blob into the URL
// params a list page materializes on a fresh visit (buildDefaultsLatch),
// and capture the current URL back into the blob's page shape for PATCH
// (capturePageDefaults). Pure functions of (settings, URL params, calendar
// start day) - the pages own the React state, the consume adjusts, and the
// one-shot URL write; nothing here touches a query, a hook, or the router.

import { monthRange, weekRange, yearRange } from './dates'
import type {
  PageKey, PlannedOrderingValue, PlannedPageSettings, PlannedStatusValue, PlannedViewValue,
  RangePreset, TransactionType, TransactionsOrderingValue, TransactionsPageSettings,
  TransfersPageSettings, UserWorkspaceSettings,
} from '../types'

/** Built-in fallback per page: a null facet on the wire resolves to these,
 *  which equal the pages' pre-feature absent-param behavior (status 'all',
 *  current month, view 'planned', the pages' DEFAULT_SORT constants, type
 *  none, range all-time).
 *  Synced with backend workspaces/schemas.py member-settings Literals. */
export const PAGE_BUILTIN_DEFAULTS = {
  planned: { status: 'all', range: 'month', view: 'planned', ordering: 'planned_date' },
  transactions: { range: 'all', type: [] as TransactionType[], ordering: '-date' },
  transfers: { range: 'all' },
} as const

// Runtime allowlists for normalizing stored values - the pages apply the
// same membership checks to raw URL params (STATUS_OPTIONS.some(...)); the
// same discipline guards the stored blob. Must list exactly the values of
// the literal unions in types/index.ts (backend workspaces/schemas.py is
// the source of truth).
const PLANNED_STATUS_VALUES: readonly PlannedStatusValue[] = ['all', 'pending', 'done', 'cancelled']
const PLANNED_VIEW_VALUES: readonly PlannedViewValue[] = ['planned', 'recurring']
const RANGE_PRESET_VALUES: readonly RangePreset[] = ['month', 'week', 'year', 'all']
const PLANNED_ORDERING_VALUES: readonly PlannedOrderingValue[] = ['planned_date', '-planned_date', '-amount', 'amount', 'name']
const TRANSACTIONS_ORDERING_VALUES: readonly TransactionsOrderingValue[] = ['-date', 'date', '-amount', 'amount', 'description']
const TYPE_VALUES: readonly TransactionType[] = ['income', 'expense', 'adjustment']

/** Membership check - the pages' option-array idiom applied to stored
 *  settings: a value outside the union reads as null. The axios response
 *  generic asserts the wire shape without validating it, and the stored
 *  blob is opaque versioned JSON that can predate an enum widening - this
 *  is the client-side half of the backend's defensive read-parse, not a
 *  no-op. */
function oneOf<T extends string>(values: readonly T[], raw: unknown): T | null {
  return typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as T) : null
}

/** Stored planned settings with every facet checked against its enum;
 *  undefined (query loading or errored) normalizes to all-null, which
 *  resolves to the built-in defaults. */
export function normalizePlannedPage(raw: PlannedPageSettings | undefined): PlannedPageSettings {
  return {
    status: oneOf(PLANNED_STATUS_VALUES, raw?.status),
    range: oneOf(RANGE_PRESET_VALUES, raw?.range),
    view: oneOf(PLANNED_VIEW_VALUES, raw?.view),
    ordering: oneOf(PLANNED_ORDERING_VALUES, raw?.ordering),
  }
}

/** Stored transactions settings, same discipline; a stored type list drops
 *  unknown entries (the page's CSV type-filter idiom), a non-array reads
 *  as null. */
export function normalizeTransactionsPage(raw: TransactionsPageSettings | undefined): TransactionsPageSettings {
  const type = raw?.type
  return {
    range: oneOf(RANGE_PRESET_VALUES, raw?.range),
    type: Array.isArray(type) ? TYPE_VALUES.filter((v) => type.includes(v)) : null,
    ordering: oneOf(TRANSACTIONS_ORDERING_VALUES, raw?.ordering),
  }
}

/** Stored transfers settings, same discipline. */
export function normalizeTransfersPage(raw: TransfersPageSettings | undefined): TransfersPageSettings {
  return { range: oneOf(RANGE_PRESET_VALUES, raw?.range) }
}

/**
 * Resolve a range preset to concrete from/to local dates, or null for
 * 'all' (no bounds). Week respects the user's calendar start day
 * (1 = Monday..7 = Sunday, the calendar_start_day preference shape).
 * "Today" is computed at call time so a session crossing midnight never
 * serves a stale range.
 *
 * Worked examples (today = 2026-10-27, a Tuesday):
 *   resolveDefaultRange('month', 1) === { from: '2026-10-01', to: '2026-10-31' }
 *   resolveDefaultRange('week', 1)  === { from: '2026-10-26', to: '2026-11-01' }
 *   resolveDefaultRange('week', 7)  === { from: '2026-10-25', to: '2026-10-31' }
 *   resolveDefaultRange('year', 1)  === { from: '2026-01-01', to: '2026-12-31' }
 *   resolveDefaultRange('all', 1)   === null
 */
export function resolveDefaultRange(preset: RangePreset, calendarStartDay: number): { from: string; to: string } | null {
  const now = new Date()
  switch (preset) {
    case 'month':
      return monthRange(now.getFullYear(), now.getMonth())
    case 'week':
      return weekRange(now, calendarStartDay)
    case 'year':
      return yearRange(now)
    case 'all':
      return null
  }
}

/** Planned facets to materialize into the URL on a fresh visit: one entry
 *  per facet; null = write nothing for that facet. */
export interface PlannedDefaultsLatch {
  /** Bounded preset (month/week/year) resolved to concrete dates; null for
   *  'all' - absent from/to params already express all-time. */
  range: { from: string; to: string } | null
  /** Stored status filter; null when 'all' (absent ?status= already
   *  expresses it) or when ?status= is present. */
  status: PlannedStatusValue | null
  /** Stored view tab; null when 'planned' or when ?view= is present. */
  view: PlannedViewValue | null
  /** Stored ordering; null when it equals the built-in 'planned_date' or
   *  when ?ordering= is present. */
  ordering: PlannedOrderingValue | null
}

/** Transactions facets to materialize; same per-facet null contract. */
export interface TransactionsDefaultsLatch {
  range: { from: string; to: string } | null
  /** Stored type filter; null when empty/absent (no filter is what absent
   *  params express) or when ?type= is present. */
  type: TransactionType[] | null
  /** Stored ordering; null when it equals the built-in '-date' or when
   *  ?ordering= is present. */
  ordering: TransactionsOrderingValue | null
}

/** Transfers facets to materialize; same per-facet null contract. */
export interface TransfersDefaultsLatch {
  range: { from: string; to: string } | null
}

/** Range latch shared by the three pages: any date param (full or partial
 *  deep link) means the URL wins - the dateDefault idiom, "a mount WITH
 *  any date param never defaults"; otherwise the resolved preset, where
 *  'all' resolves to null (nothing to write). */
function rangeLatch(
  preset: RangePreset | null,
  params: URLSearchParams,
  calendarStartDay: number,
  builtin: RangePreset,
): { from: string; to: string } | null {
  if (params.get('from') !== null || params.get('to') !== null) return null
  return resolveDefaultRange(preset ?? builtin, calendarStartDay)
}

/** Enum-facet latch: null when the param is present (deep link wins) or
 *  when the resolved value equals the built-in (absent params already
 *  express it). */
function enumLatch<T extends string>(value: T | null, builtin: T, param: string, params: URLSearchParams): T | null {
  if (params.get(param) !== null) return null
  return value !== null && value !== builtin ? value : null
}

/**
 * The URL params a fresh visit materializes from the user's stored page
 * defaults. A facet appears in the latch iff its URL params are absent
 * AND its resolved default (null facet -> the page built-in) differs from
 * what absent params already express - so planned range 'month'
 * materializes the current month's {from,to}, 'all' materializes nothing,
 * and a stored built-in value leaves the URL clean.
 *
 * Designed for a page's lazy useState initializer: called ONCE at mount
 * with the cached settings and the mount-time params (pure function of
 * its arguments). `settings === undefined` (query loading on a cold
 * cache) resolves every facet to the built-ins - exactly the pages'
 * pre-feature behavior.
 *
 * Worked examples (today = 2026-10-27, a Tuesday; calendarStartDay = 1;
 * s.planned = { status: 'pending', range: 'week', view: null, ordering: 'name' }):
 *   fresh visit:      buildDefaultsLatch(s, 'planned', params(''), 1)
 *       === { range: { from: '2026-10-26', to: '2026-11-01' }, status: 'pending', view: null, ordering: 'name' }
 *   cold cache:       buildDefaultsLatch(undefined, 'planned', params(''), 1)
 *       === { range: { from: '2026-10-01', to: '2026-10-31' }, status: null, view: null, ordering: null }
 *   deep-linked date: buildDefaultsLatch(s, 'planned', params('?from=2026-01-01&to=2026-12-31'), 1)
 *       === { range: null, status: 'pending', view: null, ordering: 'name' }
 */
export function buildDefaultsLatch(
  settings: UserWorkspaceSettings | undefined,
  page: 'planned',
  params: URLSearchParams,
  calendarStartDay: number,
): PlannedDefaultsLatch
export function buildDefaultsLatch(
  settings: UserWorkspaceSettings | undefined,
  page: 'transactions',
  params: URLSearchParams,
  calendarStartDay: number,
): TransactionsDefaultsLatch
export function buildDefaultsLatch(
  settings: UserWorkspaceSettings | undefined,
  page: 'transfers',
  params: URLSearchParams,
  calendarStartDay: number,
): TransfersDefaultsLatch
export function buildDefaultsLatch(
  settings: UserWorkspaceSettings | undefined,
  page: PageKey,
  params: URLSearchParams,
  calendarStartDay: number,
): PlannedDefaultsLatch | TransactionsDefaultsLatch | TransfersDefaultsLatch {
  if (page === 'planned') {
    const planned = normalizePlannedPage(settings?.planned)
    return {
      range: rangeLatch(planned.range, params, calendarStartDay, PAGE_BUILTIN_DEFAULTS.planned.range),
      status: enumLatch(planned.status, PAGE_BUILTIN_DEFAULTS.planned.status, 'status', params),
      view: enumLatch(planned.view, PAGE_BUILTIN_DEFAULTS.planned.view, 'view', params),
      ordering: enumLatch(planned.ordering, PAGE_BUILTIN_DEFAULTS.planned.ordering, 'ordering', params),
    }
  }
  if (page === 'transactions') {
    const transactions = normalizeTransactionsPage(settings?.transactions)
    // Type is list-valued: any non-empty stored list materializes as CSV
    // params (an empty list is what absent params already express).
    const type = params.get('type') !== null ? null : transactions.type !== null && transactions.type.length > 0 ? transactions.type : null
    return {
      range: rangeLatch(transactions.range, params, calendarStartDay, PAGE_BUILTIN_DEFAULTS.transactions.range),
      type,
      ordering: enumLatch(transactions.ordering, PAGE_BUILTIN_DEFAULTS.transactions.ordering, 'ordering', params),
    }
  }
  const transfers = normalizeTransfersPage(settings?.transfers)
  return { range: rangeLatch(transfers.range, params, calendarStartDay, PAGE_BUILTIN_DEFAULTS.transfers.range) }
}

/** Current-URL range -> named preset. Only named presets are default-able,
 *  so an exact match against the CURRENT period wins and anything else
 *  reads as 'all': no from/to -> 'all'; == monthRange(now) -> 'month'; ==
 *  weekRange(now, startDay) -> 'week'; == yearRange(now) -> 'year'; a
 *  custom range (last month, last 30 days, hand-edited bounds) -> 'all'.
 *  Exact string equality is the DATE_PRESETS chip-activation rule - any
 *  edited bound matches nothing by construction. */
function reverseResolveRange(from: string, to: string, calendarStartDay: number): RangePreset {
  if (from === '' && to === '') return 'all'
  const now = new Date()
  const month = monthRange(now.getFullYear(), now.getMonth())
  if (from === month.from && to === month.to) return 'month'
  const week = weekRange(now, calendarStartDay)
  if (from === week.from && to === week.to) return 'week'
  const year = yearRange(now)
  if (from === year.from && to === year.to) return 'year'
  return 'all'
}

/**
 * Reads the page's preset-able facets out of the URL into the page
 * sub-object for PATCH (a present page key is a full replace, so every
 * facet is always present in the result). Garbage param values degrade to
 * the built-ins exactly as the pages' raw-param reads do.
 *
 * Worked examples (today = 2026-10-27; calendarStartDay = 1):
 *   capturePageDefaults('planned', params('?status=pending&view=recurring&ordering=-amount&from=2026-10-26&to=2026-11-01'), 1)
 *     === { status: 'pending', range: 'week', view: 'recurring', ordering: '-amount' }
 *   capturePageDefaults('transactions', params('?type=income,expense&from=2026-06-01&to=2026-06-15'), 1)
 *     === { range: 'all', type: ['income', 'expense'], ordering: '-date' }   // custom range -> 'all'
 *   capturePageDefaults('planned', params(''), 1)
 *     === { status: 'all', range: 'all', view: 'planned', ordering: 'planned_date' }
 */
export function capturePageDefaults(
  params: URLSearchParams,
  page: 'planned',
  calendarStartDay: number,
): PlannedPageSettings
export function capturePageDefaults(
  params: URLSearchParams,
  page: 'transactions',
  calendarStartDay: number,
): TransactionsPageSettings
export function capturePageDefaults(
  params: URLSearchParams,
  page: 'transfers',
  calendarStartDay: number,
): TransfersPageSettings
export function capturePageDefaults(
  params: URLSearchParams,
  page: PageKey,
  calendarStartDay: number,
): PlannedPageSettings | TransactionsPageSettings | TransfersPageSettings {
  const range = reverseResolveRange(params.get('from') ?? '', params.get('to') ?? '', calendarStartDay)
  if (page === 'planned') {
    return {
      status: oneOf(PLANNED_STATUS_VALUES, params.get('status')) ?? PAGE_BUILTIN_DEFAULTS.planned.status,
      range,
      view: oneOf(PLANNED_VIEW_VALUES, params.get('view')) ?? PAGE_BUILTIN_DEFAULTS.planned.view,
      ordering: oneOf(PLANNED_ORDERING_VALUES, params.get('ordering')) ?? PAGE_BUILTIN_DEFAULTS.planned.ordering,
    }
  }
  if (page === 'transactions') {
    const rawType = params.get('type')
    return {
      range,
      // CSV list, unknown entries dropped (the page's type-filter idiom);
      // absent param = null (unset), present-but-empty = [].
      type: rawType === null ? null : TYPE_VALUES.filter((v) => rawType.split(',').includes(v)),
      ordering: oneOf(TRANSACTIONS_ORDERING_VALUES, params.get('ordering')) ?? PAGE_BUILTIN_DEFAULTS.transactions.ordering,
    }
  }
  return { range }
}
