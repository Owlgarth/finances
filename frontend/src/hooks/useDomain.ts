import { useQuery } from '@tanstack/react-query'
import { accountsApi, budgetsApi, currenciesApi, transactionsApi } from '../api/client'

/** Active (non-archived) accounts for the current workspace. */
export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: ['accounts', includeArchived],
    queryFn: () => accountsApi.list(includeArchived),
  })
}

/** Currencies enabled in the current workspace. */
export function useEnabledCurrencies() {
  return useQuery({
    queryKey: ['enabled-currencies'],
    queryFn: () => currenciesApi.enabled(),
  })
}

/** Budgets for the current workspace. */
export function useBudgets(includeInactive = false) {
  return useQuery({
    queryKey: ['budgets', includeInactive],
    queryFn: () => budgetsApi.list(includeInactive),
  })
}

/** Categories across all budgets of the workspace (cross-budget filter pickers). */
export function useWorkspaceCategories(includeArchived = false) {
  return useQuery({
    queryKey: ['workspace-categories', includeArchived],
    queryFn: () => budgetsApi.listAllCategories(includeArchived),
  })
}

/** True when the workspace has more than one enabled currency (drives currency UI). */
export function useMultiCurrency(): boolean {
  const { data } = useEnabledCurrencies()
  return (data?.length ?? 0) > 1
}

/** Whether receipt extraction is configured. When false, every extraction affordance hides. */
export function useExtractionEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['extraction-config'],
    queryFn: () => transactionsApi.extractionConfig(),
    staleTime: 5 * 60 * 1000,
  })
  return data?.enabled ?? false
}
