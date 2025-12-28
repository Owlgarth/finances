import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { SyncQueueManager, type QueuedRequest } from '../utils/syncQueue';
import { removeOptimisticItem } from '../utils/optimisticUpdates';
import { useOnlineStatus } from './useOnlineStatus';
import { getAuthToken } from '../api/client';
import toast from 'react-hot-toast';

// Key for selected account in localStorage (same as BudgetAccountContext)
const SELECTED_ACCOUNT_KEY = 'monie_selected_account';

/**
 * Validate that the queued request's context matches current context
 * Returns validation result with warnings if context has changed
 */
function validateRequestContext(request: QueuedRequest): {
  isValid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Get current workspace from JWT
  let currentWorkspaceId: number | undefined;
  const token = getAuthToken();
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      currentWorkspaceId = payload.current_workspace_id;
    } catch {
      // Ignore decode errors
    }
  }

  // Get current selected account
  const savedAccountId = localStorage.getItem(SELECTED_ACCOUNT_KEY);
  const currentAccountId = savedAccountId ? Number(savedAccountId) : undefined;

  // Check workspace mismatch
  if (request.workspaceId && currentWorkspaceId && request.workspaceId !== currentWorkspaceId) {
    warnings.push(`Request was created for workspace ${request.workspaceId} but current workspace is ${currentWorkspaceId}`);
  }

  // Check account mismatch (informational only, server will validate)
  if (request.accountId && currentAccountId && request.accountId !== currentAccountId) {
    warnings.push(`Request was created for account ${request.accountId} but current account is ${currentAccountId}`);
  }

  // Still consider valid - server will do final authorization check
  return { isValid: true, warnings };
}

export const useOfflineSync = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [syncErrors, setSyncErrors] = useState<string[]>([]);
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  /**
   * Process all queued requests
   */
  const syncQueue = useCallback(async () => {
    const queue = SyncQueueManager.getQueue();

    if (queue.length === 0) {
      return { success: true, processed: 0, failed: 0 };
    }

    if (!isOnline) {
      toast.error('Cannot sync while offline');
      return { success: false, processed: 0, failed: 0 };
    }

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: queue.length });
    setSyncErrors([]);

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process requests sequentially to maintain order
    for (let i = 0; i < queue.length; i++) {
      const request = queue[i];
      setSyncProgress({ current: i + 1, total: queue.length });

      // Validate request context before syncing
      const validation = validateRequestContext(request);
      if (validation.warnings.length > 0) {
        console.warn(`Context warnings for ${request.description}:`, validation.warnings);
      }

      try {
        // Execute the request with auth token
        const token = getAuthToken();
        const api = axios.create({
          baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        await api.request(request.config);

        // Remove optimistic item from cache if it exists
        if (request.optimisticData) {
          removeOptimisticItem(
            queryClient,
            request.optimisticData.queryKey,
            request.optimisticData.tempId
          );
        }

        // Remove from queue on success
        SyncQueueManager.removeFromQueue(request.id);
        processed++;

        console.log(`Synced: ${request.description}`);
      } catch (error) {
        console.error(`Failed to sync: ${request.description}`, error);
        const errorMsg = `Failed: ${request.description}`;
        errors.push(errorMsg);
        failed++;

        // Remove optimistic item from cache on failure too
        if (request.optimisticData) {
          removeOptimisticItem(
            queryClient,
            request.optimisticData.queryKey,
            request.optimisticData.tempId
          );
        }

        // Remove failed request from queue (no retry)
        SyncQueueManager.removeFromQueue(request.id);
      }
    }

    // Invalidate all queries to refresh data from server
    await queryClient.invalidateQueries();

    setIsSyncing(false);
    setSyncErrors(errors);

    if (failed === 0) {
      toast.success(`Successfully synced ${processed} changes`);
    } else {
      toast.error(`Synced ${processed} changes, ${failed} failed`);
    }

    return { success: failed === 0, processed, failed };
  }, [isOnline, queryClient]);

  return {
    isSyncing,
    syncProgress,
    syncErrors,
    syncQueue,
    hasPendingChanges: SyncQueueManager.hasPendingRequests(),
    pendingCount: SyncQueueManager.getQueueSize(),
  };
};
