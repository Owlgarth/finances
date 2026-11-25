import { useQuery } from '@tanstack/react-query'
import { accountsApi, budgetsApi, currenciesApi, plannedTransactionsApi, recurringTransactionsApi, transactionsApi } from '../api/client'

// List hooks set refetchOnWindowFocus: 'always': each tab keeps its own
// query cache, so a mutation in another tab (or device) can't invalidate
// this one — and the app-wide 5-min staleTime marks the list "fresh", so
// the default focus refetch (stale-only) skips it. 'always' makes these
// cheap list GETs converge whenever the user looks at the tab again.

/** Active (non-archived) accounts for the current workspace. */
export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: ['accounts', includeArchived],
    queryFn: () => accountsApi.list(includeArchived),
    refetchOnWindowFocus: 'always',
  })
}

/** Currencies enabled in the current workspace. Pass enabled: false at call
 * sites that feed CurrencySetField an explicit options prop - those sites
 * have no workspace to query, so the ambient request would only be rejected. */
export function useEnabledCurrencies(enabled = true) {
  return useQuery({
    queryKey: ['enabled-currencies'],
    queryFn: () => currenciesApi.enabled(),
    refetchOnWindowFocus: 'always',
    enabled,
  })
}

/** Budgets for the current workspace. */
export function useBudgets(includeInactive = false) {
  return useQuery({
    queryKey: ['budgets', includeInactive],
    queryFn: () => budgetsApi.list(includeInactive),
    refetchOnWindowFocus: 'always',
  })
}

/** Categories across all budgets of the workspace (cross-budget filter pickers). */
export function useWorkspaceCategories(includeArchived = false) {
  return useQuery({
    queryKey: ['workspace-categories', includeArchived],
    queryFn: () => budgetsApi.listAllCategories(includeArchived),
    refetchOnWindowFocus: 'always',
  })
}

/** One transaction by id. Shares the ['transactions', 'detail', id] cache
 * entry with /new's copy query, so the family-wide ['transactions']
 * invalidations (form save, field save, list pages) refetch it too via
 * prefix matching. No refetchOnWindowFocus override: that flag is for the
 * cheap list GETs feeding dropdowns (file header above) - the detail query
 * keeps the app defaults, exactly like the copy query it shares the key with. */
export function useTransaction(id: number | null) {
  return useQuery({
    queryKey: ['transactions', 'detail', id],
    queryFn: () => transactionsApi.get(id!),
    enabled: id != null,
  })
}

/** One recurring rule by id. Keyed under the ['recurring'] family prefix,
 * so the rule create/update invalidations refetch it through prefix
 * matching (the useTransaction shape). No refetchOnWindowFocus override,
 * for the same reason as useTransaction. */
export function useRecurringTransaction(id: number | null) {
  return useQuery({
    queryKey: ['recurring', 'detail', id],
    queryFn: () => recurringTransactionsApi.get(id!),
    enabled: id != null,
  })
}

/** One planned transaction by id. Shares the ['planned', 'detail', id] cache
 * entry with /planned/new's copy query, so the family-wide ['planned']
 * invalidations refetch it too via prefix matching. Polls while a paid item
 * is still waiting for its transaction link: the execute endpoint marks the
 * item done first and a background task links the transaction, so a short
 * bounded poll lets an open surface catch the link without a reload. */
export function usePlannedTransaction(id: number | null) {
  return useQuery({
    queryKey: ['planned', 'detail', id],
    queryFn: () => plannedTransactionsApi.get(id!),
    enabled: id != null,
    refetchInterval: (query) => {
      const item = query.state.data
      return item && item.status === 'done' && item.transaction_id === null && query.state.dataUpdateCount < 20 ? 1500 : false
    },
  })
}

/** True when the workspace has more than one enabled currency (drives currency UI). */
export function useMultiCurrency(): boolean {
  const { data } = useEnabledCurrencies()
  return (data?.length ?? 0) > 1
}

/**
 * Receipt-extraction availability. `enabled` means a parser is configured (when
 * false, every extraction affordance hides); `reachable` means it is answering
 * right now — the parser is self-hosted on a machine that is not always on, so
 * affordances stay visible but disabled while it is offline.
 *
 * Refetched on an interval so the UI recovers on its own when the host returns;
 * the backend caches the underlying probe, so polling is cheap.
 */
export function useExtractionConfig(): { enabled: boolean; reachable: boolean } {
  const { data } = useQuery({
    queryKey: ['extraction-config'],
    queryFn: () => transactionsApi.extractionConfig(),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  })
  return { enabled: data?.enabled ?? false, reachable: data?.reachable ?? false }
}
