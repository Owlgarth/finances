import type { TransactionItemInput } from '../types'

/**
 * Editing-row shape this module normalizes - structural on purpose:
 * TransactionItemsList's `Row` also carries a stable `id` and
 * ExtractionReviewModal's row also carries `confidence`; both satisfy this
 * without importing each other. `categoryId` is optional so rows built by
 * surfaces without per-item categories yet still pass through unchanged.
 */
interface RowLike {
  name: string
  quantity: string
  unit_price: string
  line_total: string
  categoryId?: number | null
}

/**
 * Row[] (table editing shape) -> TransactionItemInput[] (API payload shape).
 * Drops rows with no name, defaults quantity to '1', converts '' -> null,
 * and carries the row's explicit category across the seam (null or absent
 * = inherit the transaction's category). This module is the ONE place the
 * camelCase row shape maps onto the snake_case payload shape - extend it
 * here, never re-inline the mapping at a call site.
 */
export const rowsToItems = (rows: RowLike[]): TransactionItemInput[] =>
  rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      quantity: r.quantity || '1',
      unit_price: r.unit_price === '' ? null : r.unit_price,
      line_total: r.line_total === '' ? null : r.line_total,
      category_id: r.categoryId ?? null,
    }))
