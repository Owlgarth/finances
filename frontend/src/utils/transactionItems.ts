import type { TransactionItemInput } from '../types'

/**
 * Editing-row shape this module normalizes — structural on purpose:
 * TransactionItemsList's `Row` also carries a stable `id` (fix 9) and
 * ExtractionReviewModal's row also carries `confidence`; both satisfy this
 * without importing each other.
 */
interface RowLike {
  name: string
  quantity: string
  unit_price: string
  line_total: string
}

/**
 * Row[] (table editing shape) → TransactionItemInput[] (API payload shape).
 * Drops rows with no name, defaults quantity to '1', converts '' → null.
 *
 * SINGLE SEAM for the ARCHIVED multi-category plan
 * (.plans/archive/2026-08-01-multi-category-items/): when `Row` grows
 * `category_id` and `line_total` becomes `amount`, this mapping (+ RowLike)
 * is the ONE place the payload mapping changes — do not re-inline it.
 */
export const rowsToItems = (rows: RowLike[]): TransactionItemInput[] =>
  rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      quantity: r.quantity || '1',
      unit_price: r.unit_price === '' ? null : r.unit_price,
      line_total: r.line_total === '' ? null : r.line_total,
    }))
