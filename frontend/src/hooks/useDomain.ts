import { useQuery } from '@tanstack/react-query'
import { accountsApi, budgetsApi, currenciesApi } from '../api/client'

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

/** True when the workspace has more than one enabled currency (drives currency UI). */
export function useMultiCurrency(): boolean {
  const { data } = useEnabledCurrencies()
  return (data?.length ?? 0) > 1
}
