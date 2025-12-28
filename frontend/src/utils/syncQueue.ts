import type { AxiosRequestConfig } from 'axios';

export interface QueuedRequest {
  id: string;
  timestamp: number;
  config: AxiosRequestConfig;
  description: string;
  optimisticData?: {
    queryKey: string[];
    tempId: string;
    data: any;
  };
  // Workspace/account context for validation during sync
  workspaceId?: number;
  accountId?: number;
}

const QUEUE_KEY = 'offline_sync_queue';

/**
 * Manager for offline sync queue
 * Stores requests in localStorage when offline, processes them when back online
 */
export class SyncQueueManager {
  /**
   * Add a request to the sync queue
   */
  static addToQueue(
    config: AxiosRequestConfig,
    description: string,
    optimisticData?: {
      queryKey: string[];
      tempId: string;
      data: any;
    },
    context?: {
      workspaceId?: number;
      accountId?: number;
    }
  ): string {
    const queue = this.getQueue();
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const request: QueuedRequest = {
      id,
      timestamp: Date.now(),
      config: {
        method: config.method,
        url: config.url,
        data: config.data,
        params: config.params,
        headers: config.headers,
      },
      description,
      optimisticData,
      workspaceId: context?.workspaceId,
      accountId: context?.accountId,
    };

    queue.push(request);
    this.saveQueue(queue);

    console.log(`Added to sync queue: ${description}`, request);
    return id;
  }

  /**
   * Get all queued requests
   */
  static getQueue(): QueuedRequest[] {
    try {
      const stored = localStorage.getItem(QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to read sync queue:', error);
      return [];
    }
  }

  /**
   * Save the queue to localStorage
   */
  private static saveQueue(queue: QueuedRequest[]): void {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save sync queue:', error);
    }
  }

  /**
   * Remove a request from the queue by ID
   */
  static removeFromQueue(id: string): void {
    const queue = this.getQueue();
    const filtered = queue.filter(req => req.id !== id);
    this.saveQueue(filtered);
  }

  /**
   * Clear all queued requests
   */
  static clearQueue(): void {
    localStorage.removeItem(QUEUE_KEY);
  }

  /**
   * Get the number of pending requests
   */
  static getQueueSize(): number {
    return this.getQueue().length;
  }

  /**
   * Check if there are pending requests
   */
  static hasPendingRequests(): boolean {
    return this.getQueueSize() > 0;
  }
}
