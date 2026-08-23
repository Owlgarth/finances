import { useQuery } from '@tanstack/react-query'
import { accountsApi, budgetsApi, currenciesApi, transactionsApi } from '../api/client'

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

/** Currencies enabled in the current workspace. */
export function useEnabledCurrencies() {
  return useQuery({
    queryKey: ['enabled-currencies'],
    queryFn: () => currenciesApi.enabled(),
    refetchOnWindowFocus: 'always',
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

/** Whether receipt extraction is configured. When false, every extraction affordance hides. */
export function useExtractionEnabled(): boolean {
  return useExtractionConfig().enabled
}
