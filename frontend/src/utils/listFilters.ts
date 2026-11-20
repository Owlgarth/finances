// Filter registry for the three Activity list pages (Transactions, Planned,
// Transfers): one ordered def per filter facet over the UNCHANGED URL param
// names, so bookmarks and saved defaults replay by construction. The pages
// replace their hand-written active-count arrays and clear patches with
// registry calls (activeFilterCount / clearAllFilters); the later filter
// surfaces (applied chips, the phone sheet hub, the Add-filter menu) consume
// the same defs.
//
// The registry is a PURE BUILDER over per-render inputs the page supplies:
//   - values: the page's EFFECTIVE facet derivations - a materialized
//     default (range, type list) IS an active filter, exactly the badge
//     semantics the pages shipped;
//   - lookups: the workspace facet lists plus the resolved display helpers
//     a pure module must not own (the i18n "N selected" idiom, type labels,
//     the name lists summaries read).
//
// Counting and clearing run over the FULL def list - `available` (the
// runtime facet condition: budgets exist, categories exist, multi-currency,
// more than one account) only marks what hosts may OFFER, so a stale param
// replayed from a bookmark saved on a richer workspace still counts in the
// badge and still drops on Clear.
//
// Worked examples (the frontend has no test runner; docblock examples are
// the contract - execute them against this module before landing):
//   buildTransactionsFilters(lookups).map((d) => d.id)
//     === ['date', 'account', 'type', 'currency', 'budget', 'category', 'amount']
//   Object.keys(clearAllFilters(buildTransactionsFilters(lookups))).sort()
//     === ['account', 'amount_max', 'amount_min', 'budget', 'category',
//           'currency', 'from', 'to', 'type']
//   Object.keys(clearAllFilters(buildPlannedFilters(lookups))).length === 8
//   Object.keys(clearAllFilters(buildTransfersFilters(lookups))).sort()
//     === ['account', 'from', 'to']
//   budgetChangePatch([5], { category: [10, 11] }, cats(10 in budget 5, 11 in budget 6))
//     === { budget: [5], category: [10] }      (11 no longer belongs)
//   budgetChangePatch([], { category: [10, 11] }, cats(...))
//     === { budget: [], category: [10, 11] }   (an empty budget set pins nothing)

import { formatPeriodRange, formatQuickPickDate } from './format'
import type { ParamPatch } from './params'
import type { Account, Budget, Category } from '../types'

export type FilterDefId = 'date' | 'account' | 'type' | 'currency' | 'budget' | 'category' | 'amount'

/** Editor body kind (the container-agnostic editor bodies shared with the
 *  later filter surfaces). 'single' is the one-active row editor (the
 *  Transfers account filter). Sort is NOT a registry def: the pages'
 *  SORT_OPTIONS feed a later sort row/menu instead. */
export type FilterEditorKind = 'date' | 'multi' | 'amount' | 'single'

/** One filter facet, generic over the page's values/lookups shapes. */
export interface FilterDef<V, L> {
  id: FilterDefId
  /** The def's OWN URL params. applyPatch may emit other defs' params. */
  paramKeys: readonly string[]
  /** Field-label key for hosts (editor titles, hub rows). Plain when the
   *  key lives in the host page's own namespace; 'ns:key'-qualified when
   *  it lives in another (Planned reuses the transactions-ns
   *  shared-filter keys, the established cross-page home). */
  labelKey: string
  editor: FilterEditorKind
  /** Runtime facet condition, computed by the builder from the lookups:
   *  false when the facet cannot bind anything. Hosts never OFFER an
   *  unavailable def (Add-filter menu, hub row); counting and clearing
   *  stay unconditional over the full def list. */
  available: boolean
  /** EFFECTIVE values decide - a materialized default counts. The lookups
   *  arg is part of the uniform host call shape; predicates read values. */
  isActive: (values: V, lookups: L) => boolean
  /** Short pre-localized fragment for chips/hub rows. Called only while
   *  isActive is true; the host renders its own placeholder otherwise. */
  summarize: (values: V, lookups: L) => string
  /** Per-def removal patch (a chip's X through updateParams). */
  clear: () => ParamPatch
  /** Change handler for editor hosts: turns a commit for this def into a
   *  patch, possibly touching OTHER defs' params (the budget def prunes
   *  category selections that no longer belong). Absent = the host writes
   *  the def's own paramKeys directly with the editor's value. */
  applyPatch?: (next: number[] | string[], values: V, lookups: L) => ParamPatch
}

/** EFFECTIVE facet values (Transactions): the page's own derivations, not
 *  raw URLSearchParams - a latched default range/type list must count. */
export interface TransactionsFilterValues {
  account: number[]
  type: string[]
  currency: string[]
  budget: number[]
  category: number[]
  amountMin: string
  amountMax: string
  dateFrom: string
  dateTo: string
}

/** EFFECTIVE facet values (Planned; no type facet - status and search are
 *  not registry filters, they keep their own toolbar controls). */
export interface PlannedFilterValues {
  account: number[]
  currency: string[]
  budget: number[]
  category: number[]
  amountMin: string
  amountMax: string
  dateFrom: string
  dateTo: string
}

/** EFFECTIVE facet values (Transfers): account is a SINGLE int id (v1 wire
 *  constraint - never an array). */
export interface TransfersFilterValues {
  account: number | null
  dateFrom: string
  dateTo: string
}

/** Workspace facet lists + resolved display helpers (Transactions/Planned). */
export interface FilterLookups {
  accounts: Account[]
  budgets: Budget[]
  categories: Category[]
  /** Per-workspace runtime fact (useMultiCurrency). */
  multiCurrency: boolean
  /** The count idiom for multi-facet summaries: the page's resolved
   *  t('multiSelect.selectedCount', { count }) (common ns). */
  selectedCount: (count: number) => string
}

/** Transactions adds the resolved type labels (TYPE_OPTIONS through the
 *  transactions-ns t()). */
export interface TransactionsFilterLookups extends FilterLookups {
  typeLabels: Record<string, string>
}

/** Transfers has one facet list and no multi facets. */
export interface TransfersFilterLookups {
  accounts: Account[]
}

/** Multi-facet fragment: one value -> its label; several -> the count
 *  idiom (MultiSelect's trigger-label rule, including the unknown-id
 *  fallback to the count). */
function summarizeMulti<T extends string | number>(
  values: T[],
  labelFor: (value: T) => string | undefined,
  selectedCount: (count: number) => string,
): string {
  if (values.length === 1) {
    const label = labelFor(values[0])
    if (label !== undefined) return label
  }
  return selectedCount(values.length)
}

/** Date-range fragment: both bounds -> the localized "D - D"
 *  (formatPeriodRange); a single bound (partial deep link) alone. isActive
 *  guards the both-empty case; '' keeps the fragment total anyway. */
function summarizeDateRange(from: string, to: string): string {
  if (from && to) return formatPeriodRange(from, to)
  if (from) return formatQuickPickDate(from, 'date')
  if (to) return formatQuickPickDate(to, 'date')
  return ''
}

/** Amount-bounds fragment: the RAW param strings joined with the en dash
 *  (U+2013, the pair-separator glyph the filter inputs carry). Raw, not
 *  formatAmount: a hand-edited garbage bound would throw formatAmount's
 *  BigInt parse, and the raw string is exactly what the input echoed. */
function summarizeAmountBounds(min: string, max: string): string {
  return [min, max].filter((v) => v !== '').join('\u2013')
}

/** Date-range def shared by all three pages; only the label key differs
 *  ("Date" / "Planned date" / the transfers label). */
function dateFilterDef<V extends { dateFrom: string; dateTo: string }, L>(labelKey: string): FilterDef<V, L> {
  return {
    id: 'date',
    paramKeys: ['from', 'to'],
    labelKey,
    editor: 'date',
    available: true,
    isActive: (v) => Boolean(v.dateFrom || v.dateTo),
    summarize: (v) => summarizeDateRange(v.dateFrom, v.dateTo),
    clear: () => ({ from: null, to: null }),
  }
}

/** Amount def shared by both list pages; only the label key differs. */
function amountFilterDef<V extends { amountMin: string; amountMax: string }, L>(labelKey: string): FilterDef<V, L> {
  return {
    id: 'amount',
    paramKeys: ['amount_min', 'amount_max'],
    labelKey,
    editor: 'amount',
    available: true,
    isActive: (v) => Boolean(v.amountMin || v.amountMax),
    summarize: (v) => summarizeAmountBounds(v.amountMin, v.amountMax),
    clear: () => ({ amount_min: null, amount_max: null }),
  }
}

/** Budget change: write the new budget list AND prune category selections
 *  that no longer belong to the selected budgets (the retired collapsible
 *  panels' setBudgetFilter rule, unified here). The budget editor commits
 *  number[] (facet ids). */
export function budgetChangePatch(
  next: number[] | string[],
  values: { category: number[] },
  lookups: { categories: Category[] },
): ParamPatch {
  // Keep only categories that still belong to the selected budgets.
  const nextBudgetSet = new Set<string | number>(next)
  const kept = values.category.filter((id) => {
    const category = lookups.categories.find((c) => c.id === id)
    return category !== undefined && (nextBudgetSet.size === 0 || nextBudgetSet.has(category.budget_id))
  })
  return { budget: next, category: kept }
}

export function buildTransactionsFilters(
  lookups: TransactionsFilterLookups,
): FilterDef<TransactionsFilterValues, TransactionsFilterLookups>[] {
  return [
    dateFilterDef<TransactionsFilterValues, TransactionsFilterLookups>('listFilters.dateLabel'),
    {
      id: 'account',
      paramKeys: ['account'],
      labelKey: 'filters.account',
      editor: 'multi',
      available: lookups.accounts.length > 1,
      isActive: (v) => v.account.length > 0,
      summarize: (v, l) => summarizeMulti(v.account, (id) => l.accounts.find((a) => a.id === id)?.name, l.selectedCount),
      clear: () => ({ account: null }),
    },
    {
      id: 'type',
      paramKeys: ['type'],
      labelKey: 'filters.type',
      editor: 'multi',
      available: true,
      isActive: (v) => v.type.length > 0,
      summarize: (v, l) => summarizeMulti(v.type, (value) => l.typeLabels[value], l.selectedCount),
      clear: () => ({ type: null }),
    },
    {
      id: 'currency',
      paramKeys: ['currency'],
      labelKey: 'filters.currency',
      editor: 'multi',
      available: lookups.multiCurrency,
      // The code is the fragment (registry data renders verbatim; the long
      // "CODE - Name" form is the panel option label, not a chip fragment).
      summarize: (v, l) => summarizeMulti(v.currency, (code) => code, l.selectedCount),
      isActive: (v) => v.currency.length > 0,
      clear: () => ({ currency: null }),
    },
    {
      id: 'budget',
      paramKeys: ['budget'],
      labelKey: 'listFilters.budget',
      editor: 'multi',
      available: lookups.budgets.length > 0,
      isActive: (v) => v.budget.length > 0,
      summarize: (v, l) => summarizeMulti(v.budget, (id) => l.budgets.find((b) => b.id === id)?.name, l.selectedCount),
      clear: () => ({ budget: null }),
      applyPatch: budgetChangePatch,
    },
    {
      id: 'category',
      paramKeys: ['category'],
      labelKey: 'listFilters.category',
      editor: 'multi',
      available: lookups.categories.length > 0,
      isActive: (v) => v.category.length > 0,
      summarize: (v, l) => summarizeMulti(v.category, (id) => l.categories.find((c) => c.id === id)?.name, l.selectedCount),
      clear: () => ({ category: null }),
    },
    amountFilterDef<TransactionsFilterValues, TransactionsFilterLookups>('listFilters.amount'),
  ]
}

export function buildPlannedFilters(
  lookups: FilterLookups,
): FilterDef<PlannedFilterValues, FilterLookups>[] {
  return [
    dateFilterDef<PlannedFilterValues, FilterLookups>('filters.plannedDate'),
    {
      id: 'account',
      paramKeys: ['account'],
      labelKey: 'filters.account',
      editor: 'multi',
      available: lookups.accounts.length > 1,
      isActive: (v) => v.account.length > 0,
      summarize: (v, l) => summarizeMulti(v.account, (id) => l.accounts.find((a) => a.id === id)?.name, l.selectedCount),
      clear: () => ({ account: null }),
    },
    {
      id: 'currency',
      paramKeys: ['currency'],
      labelKey: 'filters.currency',
      editor: 'multi',
      available: lookups.multiCurrency,
      summarize: (v, l) => summarizeMulti(v.currency, (code) => code, l.selectedCount),
      isActive: (v) => v.currency.length > 0,
      clear: () => ({ currency: null }),
    },
    {
      id: 'budget',
      paramKeys: ['budget'],
      // Planned renders the shared budget/category/amount labels through
      // transactions-ns keys (the shared filters' established home), so the
      // label is ns-qualified for host resolution outside the planned ns.
      labelKey: 'transactions:listFilters.budget',
      editor: 'multi',
      available: lookups.budgets.length > 0,
      isActive: (v) => v.budget.length > 0,
      summarize: (v, l) => summarizeMulti(v.budget, (id) => l.budgets.find((b) => b.id === id)?.name, l.selectedCount),
      clear: () => ({ budget: null }),
      applyPatch: budgetChangePatch,
    },
    {
      id: 'category',
      paramKeys: ['category'],
      labelKey: 'transactions:listFilters.category',
      editor: 'multi',
      available: lookups.categories.length > 0,
      isActive: (v) => v.category.length > 0,
      summarize: (v, l) => summarizeMulti(v.category, (id) => l.categories.find((c) => c.id === id)?.name, l.selectedCount),
      clear: () => ({ category: null }),
    },
    amountFilterDef<PlannedFilterValues, FilterLookups>('transactions:listFilters.amount'),
  ]
}

export function buildTransfersFilters(
  lookups: TransfersFilterLookups,
): FilterDef<TransfersFilterValues, TransfersFilterLookups>[] {
  return [
    dateFilterDef<TransfersFilterValues, TransfersFilterLookups>('filters.dateLabel'),
    {
      id: 'account',
      paramKeys: ['account'],
      labelKey: 'filters.accountLabel',
      editor: 'single',
      // Today's panel renders the account filter unconditionally on this
      // page (no accounts>1 gate - that gate is a list-page facet rule).
      available: true,
      isActive: (v) => v.account != null,
      // Reads the builder's own lookups (the same lists object the host
      // passes back at call time) - the def is built from it, so the
      // summarize captures its construction-time list instead of taking
      // the call-time second arg the multi defs use.
      summarize: (v) => lookups.accounts.find((a) => a.id === v.account)?.name ?? String(v.account),
      clear: () => ({ account: null }),
    },
  ]
}

/** Registry-driven badge count: each facet counts once, however many
 *  values it holds, over the FULL def list (availability never gates it). */
export function activeFilterCount<V, L>(filters: FilterDef<V, L>[], values: V, lookups: L): number {
  return filters.filter((f) => f.isActive(values, lookups)).length
}

/** Union of every def's clear patch - key-for-key today's hand-written
 *  per-page clear patches (Transactions 9 keys, Planned 8, Transfers 3).
 *  All-null values mean createUpdateParams only deletes keys, so union
 *  order cannot affect the resulting URL. */
export function clearAllFilters<V, L>(filters: FilterDef<V, L>[]): ParamPatch {
  return Object.assign({}, ...filters.map((f) => f.clear()))
}
