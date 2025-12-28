/**
 * Offline Display Cache Manager
 * Stores offline records in localStorage for UI display
 * Separate from sync queue - this is purely for showing pending records in the UI
 */

interface OfflineDisplayItem {
  tempId: string;
  timestamp: number;
  entityType: 'transaction' | 'planned-transaction' | 'currency-exchange' | 'category' | 'budget-period';
  budgetPeriodId: number | null;
  data: any; // The full record data including category object
}

const DISPLAY_CACHE_KEY = 'offline_display_cache';

export class OfflineDisplayCache {
  /**
   * Add an item to the offline display cache
   */
  static addItem(
    tempId: string,
    entityType: OfflineDisplayItem['entityType'],
    budgetPeriodId: number | null,
    data: any
  ): void {
    const items = this.getItems();

    const item: OfflineDisplayItem = {
      tempId,
      timestamp: Date.now(),
      entityType,
      budgetPeriodId,
      data,
    };

    items.push(item);
    this.saveItems(items);

    console.log('[Offline Display Cache] Added item:', entityType, tempId);
  }

  /**
   * Get all items from the cache
   */
  static getItems(): OfflineDisplayItem[] {
    try {
      const stored = localStorage.getItem(DISPLAY_CACHE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('[Offline Display Cache] Failed to read cache:', error);
      return [];
    }
  }

  /**
   * Get items by entity type and budget period
   */
  static getItemsByType(
    entityType: OfflineDisplayItem['entityType'],
    budgetPeriodId?: number | null
  ): any[] {
    const items = this.getItems();

    return items
      .filter(item => {
        // Match entity type
        if (item.entityType !== entityType) return false;

        // If budgetPeriodId is provided, filter by it
        if (budgetPeriodId !== undefined && item.budgetPeriodId !== budgetPeriodId) {
          return false;
        }

        return true;
      })
      .map(item => item.data);
  }

  /**
   * Remove an item by tempId
   */
  static removeItem(tempId: string): void {
    const items = this.getItems();
    const filtered = items.filter(item => item.tempId !== tempId);
    this.saveItems(filtered);
    console.log('[Offline Display Cache] Removed item:', tempId);
  }

  /**
   * Clear all items
   */
  static clearAll(): void {
    localStorage.removeItem(DISPLAY_CACHE_KEY);
    console.log('[Offline Display Cache] Cleared all items');
  }

  /**
   * Save items to localStorage
   */
  private static saveItems(items: OfflineDisplayItem[]): void {
    try {
      localStorage.setItem(DISPLAY_CACHE_KEY, JSON.stringify(items));
    } catch (error) {
      console.error('[Offline Display Cache] Failed to save cache:', error);
    }
  }

  /**
   * Get count of offline items
   */
  static getCount(): number {
    return this.getItems().length;
  }
}
