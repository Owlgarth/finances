import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { currenciesApi } from '../api/client'

/** Synced with backend currencies/schemas.py DEFAULT_WORKSPACE_CURRENCIES. */
export const DEFAULT_CURRENCY_CODES: readonly string[] = ['PLN', 'EUR', 'USD']

// Plain global key, deliberately NOT added to WorkspaceContext's
// userScopedQueryKeys keep-set: the catalog is public and workspace-
// independent, so the workspace-cache wipe removing it costs at most one
// refetch (the safe direction under remove-by-predicate semantics).
export const publicCurrencyCatalogKey = ['currency-catalog-public'] as const

/**
 * The public ISO catalog for pre-auth screens (registration, workspace
 * creation). `options` are ready for MultiSelect/Select: plain-string labels
 * ("PLN - Zloty") so the panel search matches both code and name.
 */
export function usePublicCurrencyCatalog() {
  const { data, isLoading, isError } = useQuery({
    queryKey: publicCurrencyCatalogKey,
    queryFn: currenciesApi.catalogPublic,
  })

  const options = useMemo(
    () => (data ?? []).map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` })),
    [data],
  )

  return { options, isLoading, isError }
}
