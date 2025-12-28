import type { QueryClient } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import { OfflineDisplayCache } from './offlineDisplayCache';

/**
 * Performs optimistic update for a create mutation when offline
 * Returns optimistic data to be stored with the queued request
 */
export function performOptimisticUpdate(
  queryClient: QueryClient,
  config: AxiosRequestConfig
): { queryKey: string[]; tempId: string; data: any } | null {
  const method = config.method?.toLowerCase();
  const url = config.url || '';

  // Only handle POST (create) requests
  if (method !== 'post') {
    return null;
  }

  // Generate temporary ID
  const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Determine entity type and create optimistic data
  let queryKey: string[] = [];
  let optimisticItem: any = null;

  // Transactions
  if (url.includes('/transactions') && !url.includes('planned')) {
    // Include budget_period_id in queryKey to only update queries for this specific period
    queryKey = ['transactions', config.data?.budget_period_id];

    // Look up category from cache if category_id is provided
    let category = null;
    if (config.data?.category_id && config.data?.budget_period_id) {
      const categories = queryClient.getQueryData(['categories', config.data.budget_period_id]) as any[];
      if (categories && Array.isArray(categories)) {
        const found = categories.find((c: any) => c.id === config.data.category_id);
        if (found) {
          category = found;
          console.log('[Optimistic Update] Found category:', category.name, 'for transaction');
        } else {
          console.warn('[Optimistic Update] Category ID', config.data.category_id, 'not found in cache');
        }
      } else {
        console.warn('[Optimistic Update] Categories not in cache for period:', config.data.budget_period_id);
      }
    }

    optimisticItem = {
      id: tempId,
      ...config.data,
      category, // Include the full category object (may be null if not found)
      _offline: true,
      _tempId: tempId,
    };

    // Add to cache - update only transaction queries for this budget period
    // This will match ['transactions', periodId, ...any other params]
    queryClient.setQueriesData(
      { queryKey },
      (old: any) => {
        if (!old) return [optimisticItem];
        if (!Array.isArray(old)) return old;
        return [optimisticItem, ...old];
      }
    );

    // Add to offline display cache for persistent UI display across page reloads
    OfflineDisplayCache.addItem(
      tempId,
      'transaction',
      config.data?.budget_period_id || null,
      optimisticItem
    );
  }
  // Planned Transactions
  else if (url.includes('/planned-transactions')) {
    // Include budget_period_id in queryKey to only update queries for this specific period
    queryKey = ['planned-transactions', config.data?.budget_period_id];

    // Look up category from cache if category_id is provided
    let category = null;
    if (config.data?.category_id && config.data?.budget_period_id) {
      const categories = queryClient.getQueryData(['categories', config.data.budget_period_id]) as any[];
      if (categories && Array.isArray(categories)) {
        const found = categories.find((c: any) => c.id === config.data.category_id);
        if (found) {
          category = found;
          console.log('[Optimistic Update] Found category:', category.name, 'for planned transaction');
        } else {
          console.warn('[Optimistic Update] Category ID', config.data.category_id, 'not found in cache');
        }
      } else {
        console.warn('[Optimistic Update] Categories not in cache for period:', config.data.budget_period_id);
      }
    }

    optimisticItem = {
      id: tempId,
      ...config.data,
      category, // Include the full category object (may be null if not found)
      _offline: true,
      _tempId: tempId,
    };

    // Update only planned-transactions queries for this budget period
    queryClient.setQueriesData(
      { queryKey },
      (old: any) => {
        if (!old) return [optimisticItem];
        if (!Array.isArray(old)) return old;
        return [optimisticItem, ...old];
      }
    );

    // Add to offline display cache for persistent UI display across page reloads
    OfflineDisplayCache.addItem(
      tempId,
      'planned-transaction',
      config.data?.budget_period_id || null,
      optimisticItem
    );
  }
  // Currency Exchanges
  else if (url.includes('/currency-exchanges')) {
    // Include budget_period_id in queryKey to only update queries for this specific period
    queryKey = ['currency-exchanges', config.data?.budget_period_id];
    optimisticItem = {
      id: tempId,
      ...config.data,
      _offline: true,
      _tempId: tempId,
    };

    // Update only currency-exchanges queries for this budget period
    queryClient.setQueriesData(
      { queryKey },
      (old: any) => {
        if (!old) return [optimisticItem];
        if (!Array.isArray(old)) return old;
        return [optimisticItem, ...old];
      }
    );

    // Add to offline display cache for persistent UI display across page reloads
    OfflineDisplayCache.addItem(
      tempId,
      'currency-exchange',
      config.data?.budget_period_id || null,
      optimisticItem
    );
  }
  // Categories
  else if (url.includes('/categories')) {
    queryKey = ['categories'];
    optimisticItem = {
      id: tempId,
      ...config.data,
      _offline: true,
      _tempId: tempId,
    };

    // Update all categories queries
    queryClient.setQueriesData(
      { queryKey },
      (old: any) => {
        if (!old) return [optimisticItem];
        if (!Array.isArray(old)) return old;
        return [optimisticItem, ...old];
      }
    );
  }
  // Budget Periods
  else if (url.includes('/budget-periods')) {
    queryKey = ['budget-periods'];
    optimisticItem = {
      id: tempId,
      ...config.data,
      _offline: true,
      _tempId: tempId,
    };

    // Update all budget-periods queries
    queryClient.setQueriesData(
      { queryKey },
      (old: any) => {
        if (!old) return [optimisticItem];
        if (!Array.isArray(old)) return old;
        return [optimisticItem, ...old];
      }
    );
  }

  if (!optimisticItem) {
    return null;
  }

  return {
    queryKey,
    tempId,
    data: optimisticItem,
  };
}

/**
 * Removes optimistic item from cache after successful sync
 */
export function removeOptimisticItem(
  queryClient: QueryClient,
  queryKey: string[],
  tempId: string
): void {
  // Remove from React Query cache
  queryClient.setQueriesData(
    { queryKey },
    (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.filter((item: any) => item._tempId !== tempId);
    }
  );

  // Remove from offline display cache
  OfflineDisplayCache.removeItem(tempId);
}

/**
 * Checks if an item was added offline
 */
export function isOfflineItem(item: any): boolean {
  return item?._offline === true;
}
