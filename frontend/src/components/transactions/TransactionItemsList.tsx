import { useState } from 'react'
import { Plus, Trash2, AlertTriangle, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { parseAmountNumber } from '../../utils/amountInput'
import { formatAmount } from '../../utils/format'
import { inputClass, labelClass } from '../common/formStyles'
import Select, { type SelectOption } from '../common/Select'

export interface Row {
  /** Stable per-row identity — survives reorders. key={index} made focus and
   * text selection jump mid-edit when `move` swapped values between two
   * stationary DOM nodes. */
  id: string
  name: string
  quantity: string
  unit_price: string
  line_total: string
  /** Explicit per-item category override; null or absent = inherit the
   *  transaction's category (the backend COALESCEs on read). Optional so
   *  row factories that do not model categories yet (parsed-receipt fill,
   *  the editor's toRow) still compile while those surfaces land category
   *  seeding. */
  categoryId?: number | null
}

interface Props {
  rows: Row[]
  onChange: (rows: Row[]) => void
  amount: string
  currencyCode?: string | null
  /** Budget categories of the transaction's category (parent-owned query);
   *  the per-item Select's option list. Defaults empty until the parent
   *  wires it. */
  categoryOptions?: SelectOption<number>[]
  /** The transaction's own category id; null disables the per-item selects -
   *  items may only carry categories from the tx category's budget, and
   *  with no tx category there is no such budget. */
  transactionCategoryId?: number | null
  /** Remainder contract (parent-owned state). The remainder card renders
   *  only when BOTH change handlers are provided (or remainderReadOnly is
   *  set), a named user row exists, and the derived remainder is positive. */
  remainderCategoryId?: number | null
  onRemainderCategoryIdChange?: (categoryId: number | null) => void
  remainderName?: string
  onRemainderNameChange?: (name: string) => void
  /** Display-only remainder variant (create mode): renders the card - chip,
   *  derived amount, hint - WITHOUT the name input and category Select.
   *  Create payloads carry no remainder fields, so those controls would be
   *  dead inputs. */
  remainderReadOnly?: boolean
}

const emptyRow = (): Row => ({ id: crypto.randomUUID(), name: '', quantity: '1', unit_price: '', line_total: '', categoryId: null })

/** Sum of line totals, falling back to quantity × unit price — mirrors the backend. */
function computeTotal(rows: Row[]): number {
  return rows.reduce((sum, r) => {
    if (r.line_total !== '') return sum + (parseAmountNumber(r.line_total) ?? 0)
    if (r.unit_price !== '') {
      // Display-only tolerance: an empty or mid-edit quantity reads as 1
      // (the row's own default) so the live preview total never errors
      // while the user is still typing.
      const qty = parseAmountNumber(r.quantity) ?? 1
      return sum + qty * (parseAmountNumber(r.unit_price) ?? 0)
    }
    return sum
  }, 0)
}

// Card shell: keep the `border` width keyword and ONLY swap the color.
// CRITICAL Tailwind preflight trap: `border-primary` alone renders NO border
// (preflight resets border-width to 0 unless `border` is present). Always keep `border`.
const cardShell = (isOpen: boolean): string =>
  'bg-surface border rounded-sm p-3 ' + (isOpen ? 'border-primary ring-1 ring-primary' : 'border-border')

// Action icon buttons: real 44×44 boxes on mobile (NOT .touch-hit — adjacent expanded
// hit areas of neighboring buttons would overlap).
const actionBtn =
  'inline-flex items-center justify-center p-1.5 text-text-muted max-sm:min-h-[44px] max-sm:min-w-[44px]'

/** DOM ids wiring one item row's expandable region and inputs together
 *  (the aria-controls / htmlFor / id triplets). Internal identifiers,
 *  never UI text; built at module scope so no string literal rides inside
 *  the JSX map callback. */
const itemDomIds = (index: number) => ({
  formId: `item-${index}-form`,
  nameId: `item-${index}-name`,
  categorySelectId: `item-${index}-category`,
})

/** Sentinel Select value for "inherit the transaction category" - the shared
 *  Select cannot hold a null-valued option, and 0 can never collide with a
 *  real category id (same trick as NO_ACCOUNT in utils/accountSelect). */
const INHERIT_CATEGORY = 0

export default function TransactionItemsList({
  rows,
  onChange,
  amount,
  currencyCode,
  categoryOptions = [],
  transactionCategoryId = null,
  remainderCategoryId = null,
  onRemainderCategoryIdChange,
  remainderName = '',
  onRemainderNameChange,
  remainderReadOnly = false,
}: Props) {
  const { t } = useTranslation('transactions')
  const isTouch = useIsTouch()
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  // Set only on Add; cleared the first time the new card's Name input receives focus.
  // Drives desktop-only autofocus through pure event wiring (see onFocus below).
  const [justAddedIndex, setJustAddedIndex] = useState<number | null>(null)

  const updateRow = (index: number, patch: Partial<Row>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index))
    // Index bookkeeping — keep the open card sane after a delete:
    //  - removed the open card itself  → collapse
    //  - removed a row ABOVE the open one → shift the open index down by 1
    //  - removed a row BELOW the open one → unaffected
    setExpandedIndex((cur) => {
      if (cur === null) return null
      if (cur === index) return null
      if (cur > index) return cur - 1
      return cur
    })
  }

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
    // The swap exchanges rows at `index` and `target`; the open card follows whichever moved:
    //  - the open card was the one we moved  → it now lives at `target`
    //  - the open card was the one displaced into `index` → it now lives at `index`
    //  - any other row was open → unaffected
    setExpandedIndex((cur) => {
      if (cur === index) return target
      if (cur === target) return index
      return cur
    })
  }

  const handleAdd = () => {
    onChange([...rows, emptyRow()])
    setExpandedIndex(rows.length) // the new row's index (== old length)
    setJustAddedIndex(rows.length)
  }

  // The Inherit option's label interpolates the tx category's name, looked up
  // from the option list (item categories share the tx category's budget, so
  // the tx category is normally a member). Labels are plain strings at every
  // call site (budget categories render c.name); the typeof guard keeps the
  // t() interpolation type-honest. An archived tx category drops out of the
  // option list and falls back to the shared "Uncategorized" label.
  const categoryNameById = (id: number | null | undefined): string | null => {
    if (id == null) return null
    const label = categoryOptions.find((o) => o.value === id)?.label
    return typeof label === 'string' ? label : null
  }
  const txCategoryName = categoryNameById(transactionCategoryId)
  const itemCategoryOptions: SelectOption<number>[] = [
    {
      value: INHERIT_CATEGORY,
      label: t('items.inheritOption', { category: txCategoryName ?? t('form.uncategorized') }),
    },
    ...categoryOptions,
  ]

  const itemsTotal = computeTotal(rows)
  const parsedAmount = parseAmountNumber(amount)
  // Suppress the mismatch warning when amount is empty or unparseable — the
  // user hasn't entered one yet (create mode) or the field is mid-edit.
  const hasAmount = amount !== '' && parsedAmount !== null
  const absAmount = hasAmount ? Math.abs(parsedAmount) : 0
  const mismatch = hasAmount && rows.some((r) => r.name.trim()) && Math.abs(itemsTotal - absAmount) > 0.01
  // The remainder amount is ALWAYS derived in render, never state: the server
  // owns the remainder row's size, the UI previews it live. Over-sum (or an
  // empty/unparseable amount) drives this to <= 0.01 and hides the card while
  // the mismatch warning above still communicates the gap.
  const remainder = absAmount - itemsTotal
  const showRemainder =
    (remainderReadOnly || (onRemainderCategoryIdChange != null && onRemainderNameChange != null)) &&
    hasAmount &&
    rows.some((r) => r.name.trim()) &&
    remainder > 0.01

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const isOpen = expandedIndex === index
        const autoFocusName = justAddedIndex === index

        // Right-side collapsed value:
        //  - explicit line_total (shown RAW, as-typed — do NOT reformat mid-edit)
        //  - else computed qty × unit_price (formatted) when both parse
        //  - else em-dash placeholder
        // Unparseable mid-edit quantity falls back to 1 (the row default);
        // only unit_price can still disqualify the computed preview.
        const qtyNum = parseAmountNumber(row.quantity) ?? 1
        const unitNum = parseAmountNumber(row.unit_price)
        const rightValue =
          row.line_total !== ''
            ? row.line_total
            : row.unit_price !== '' && unitNum !== null
              ? formatAmount(qtyNum * unitNum)
              : '—'

        // Effective category for the collapsed subline: the row's explicit
        // override, else the transaction's category.
        const effectiveCategoryName = categoryNameById(row.categoryId ?? transactionCategoryId)

        const { formId, nameId, categorySelectId } = itemDomIds(index)

        return (
          <div key={row.id} className={cardShell(isOpen)}>
            {/* Collapsed header — a real <button>, toggles on ALL breakpoints (not tappableProps). */}
            <button
              type="button"
              onClick={() => setExpandedIndex((cur) => (cur === index ? null : index))}
              aria-expanded={isOpen}
              aria-controls={formId}
              className={`w-full flex items-center justify-between gap-3 text-sm text-left active:bg-surface-hover ${
                isOpen ? '' : 'hover:bg-surface-hover'
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className={`block truncate ${row.name.trim() ? 'text-text' : 'text-text-muted'}`}>
                  {row.name.trim() || t('items.untitled')}
                </span>
                <div className="text-[10px] font-mono text-text-muted truncate">
                  {row.quantity}
                  {row.unit_price ? ` × ${row.unit_price}` : ''}
                  {effectiveCategoryName ? ` · ${effectiveCategoryName}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono whitespace-nowrap text-text">{rightValue}</span>
                <ChevronDown
                  size={14}
                  aria-hidden="true"
                  className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {/* Expanded form — SIBLING of the header button, never nested inside it. */}
            {isOpen && (
              <div id={formId} role="region" aria-label={t('items.detailsAria')} className="mt-3 border-t border-border pt-3 space-y-2">
                <div>
                  <label className={labelClass} htmlFor={nameId}>{t('items.nameLabel')}</label>
                  <input
                    id={nameId}
                    value={row.name}
                    onChange={(e) => updateRow(index, { name: e.target.value })}
                    // Desktop-only autofocus on Add. `autoFocus` is mount-only — it fires when
                    // the new card's form mounts on Add. The onFocus self-clear means re-opening
                    // a previously-added card (which remounts the form) does NOT re-steal focus,
                    // so "only the Add path focuses" holds. No effects machinery -
                    // focus is pure event wiring.
                    autoFocus={autoFocusName && !isTouch}
                    onFocus={() => {
                      if (justAddedIndex === index) setJustAddedIndex(null)
                    }}
                    className={`${inputClass} max-sm:min-h-[44px]`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={categorySelectId}>{t('items.categoryLabel')}</label>
                  <Select
                    id={categorySelectId}
                    value={row.categoryId ?? INHERIT_CATEGORY}
                    onChange={(v) => updateRow(index, { categoryId: v === INHERIT_CATEGORY ? null : v })}
                    options={itemCategoryOptions}
                    placeholder={t('items.categoryPlaceholder')}
                    disabled={transactionCategoryId == null}
                    searchable
                    className="w-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>{t('items.quantityLabel')}</label>
                    <input
                      value={row.quantity}
                      inputMode="decimal"
                      onChange={(e) => updateRow(index, { quantity: e.target.value })}
                      className={`${inputClass} max-sm:min-h-[44px]`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('items.unitPriceLabel')}</label>
                    <input
                      value={row.unit_price}
                      inputMode="decimal"
                      placeholder="—"
                      onChange={(e) => updateRow(index, { unit_price: e.target.value })}
                      className={`${inputClass} max-sm:min-h-[44px]`}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>{t('items.lineTotalLabel')}</label>
                  <input
                    value={row.line_total}
                    inputMode="decimal"
                    placeholder="—"
                    onChange={(e) => updateRow(index, { line_total: e.target.value })}
                    className={`${inputClass} max-sm:min-h-[44px]`}
                  />
                </div>
                {/* Action row — lives INSIDE the expanded form. Collapsed card is pure display. */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    aria-label={t('items.moveUpAria')}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className={`${actionBtn} hover:text-text disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('items.moveDownAria')}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                    className={`${actionBtn} hover:text-text disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t('items.deleteAria')}
                    onClick={() => removeRow(index)}
                    className={`${actionBtn} hover:text-negative`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {showRemainder && (
        <div
          role="group"
          aria-label={t('items.remainderAria')}
          className="bg-background border border-border rounded-sm p-3 space-y-2"
        >
          {/* Header row: system chip + derived amount. The card is NOT an
              accordion: no toggle, no move/delete/reorder - the system owns
              the remainder's existence and size; only its category and name
              are user-editable. */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text-muted select-none">
              {t('items.remainderLabel')}
            </span>
            <span className="font-mono text-xs text-text-muted whitespace-nowrap">
              {currencyCode ? `${formatAmount(remainder)} ${currencyCode}` : formatAmount(remainder)}
            </span>
          </div>
          {/* Editable controls - hidden in the remainderReadOnly variant
              (create mode): create payloads carry no remainder fields, so
              the inputs would be dead. Chip + amount + hint still show. */}
          {!remainderReadOnly && (
            <>
              <div>
                <label className={labelClass} htmlFor="remainder-name">{t('items.remainderNameLabel')}</label>
                <input
                  id="remainder-name"
                  value={remainderName}
                  onChange={(e) => onRemainderNameChange?.(e.target.value)}
                  placeholder={t('items.remainderNamePlaceholder')}
                  /* Mirrors the backend remainder_name max_length (300): an
                     over-long name is stopped at input, not rejected 422 on
                     save. */
                  maxLength={300}
                  className={`${inputClass} max-sm:min-h-[44px]`}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="remainder-category">{t('items.categoryLabel')}</label>
                <Select
                  id="remainder-category"
                  value={remainderCategoryId ?? INHERIT_CATEGORY}
                  onChange={(v) => onRemainderCategoryIdChange?.(v === INHERIT_CATEGORY ? null : v)}
                  options={itemCategoryOptions}
                  placeholder={t('items.categoryPlaceholder')}
                  disabled={transactionCategoryId == null}
                  searchable
                  className="w-full"
                />
              </div>
            </>
          )}
          <p className="text-[11px] text-text-muted">{t('items.remainderHint')}</p>
        </div>
      )}

      {/* Footer — unchanged: Add-item button + items-total + mismatch warning. */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleAdd}
          className="text-xs text-primary hover:text-primary-hover inline-flex items-center gap-1"
        >
          <Plus size={12} /> {t('items.addItem')}
        </button>
        {rows.some((r) => r.name.trim()) && (
          <span className="text-xs font-mono text-text-muted">
            {currencyCode
              ? `${t('items.itemsTotal', { total: formatAmount(itemsTotal) })} ${currencyCode}`
              : t('items.itemsTotal', { total: formatAmount(itemsTotal) })}
          </span>
        )}
      </div>

      {mismatch && (
        <p className="text-xs text-warning inline-flex items-center gap-1">
          <AlertTriangle size={12} /> {t('items.mismatch', { items: formatAmount(itemsTotal), amount: formatAmount(absAmount) })}
        </p>
      )}
    </div>
  )
}
