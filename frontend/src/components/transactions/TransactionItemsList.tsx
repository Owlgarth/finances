import { useState } from 'react'
import { Plus, Trash2, AlertTriangle, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { formatAmount } from '../../utils/format'
import { inputClass, labelClass } from '../common/formStyles'

export interface Row {
  /** Stable per-row identity — survives reorders. key={index} made focus and
   * text selection jump mid-edit when `move` swapped values between two
   * stationary DOM nodes. */
  id: string
  name: string
  quantity: string
  unit_price: string
  line_total: string
}

interface Props {
  rows: Row[]
  onChange: (rows: Row[]) => void
  amount: string
  currencyCode?: string | null
}

const emptyRow = (): Row => ({ id: crypto.randomUUID(), name: '', quantity: '1', unit_price: '', line_total: '' })

/** Sum of line totals, falling back to quantity × unit price — mirrors the backend. */
function computeTotal(rows: Row[]): number {
  return rows.reduce((sum, r) => {
    if (r.line_total !== '') return sum + (parseFloat(r.line_total) || 0)
    if (r.unit_price !== '') return sum + (parseFloat(r.quantity || '1') || 0) * (parseFloat(r.unit_price) || 0)
    return sum
  }, 0)
}

// Card shell: keep the `border` width keyword and ONLY swap the color.
// CRITICAL Tailwind preflight trap: `border-primary` alone renders NO border
// (preflight resets border-width to 0 unless `border` is present). Always keep `border`.
const cardShell = (isOpen: boolean): string =>
  'bg-surface border rounded-sm p-3 ' + (isOpen ? 'border-primary ring-1 ring-primary' : 'border-border')

// Action icon buttons: real 44×44 boxes on mobile (NOT .touch-hit — adjacent expanded
// hit areas would overlap; see CODING_SUMMARIES Task 10 for the .touch-hit cascade trap).
const actionBtn =
  'inline-flex items-center justify-center p-1.5 text-text-muted max-sm:min-h-[44px] max-sm:min-w-[44px]'

export default function TransactionItemsList({ rows, onChange, amount, currencyCode }: Props) {
  const { t } = useTranslation('transactions')
  const isTouch = useIsTouch()
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  // Set only on Add; cleared the first time the new card's Name input receives focus.
  // Drives desktop-only autofocus without any useEffect (see onFocus below).
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

  const itemsTotal = computeTotal(rows)
  const parsedAmount = parseFloat(amount)
  // Suppress the mismatch warning when amount is empty or unparseable — the
  // user hasn't entered one yet (create mode) or the field is mid-edit.
  const hasAmount = amount !== '' && !isNaN(parsedAmount)
  const absAmount = hasAmount ? Math.abs(parsedAmount) : 0
  const mismatch = hasAmount && rows.some((r) => r.name.trim()) && Math.abs(itemsTotal - absAmount) > 0.01

  return (
    <div className="space-y-2">
      {rows.map((row, index) => {
        const isOpen = expandedIndex === index
        const autoFocusName = justAddedIndex === index

        // Right-side collapsed value:
        //  - explicit line_total (shown RAW, as-typed — do NOT reformat mid-edit)
        //  - else computed qty × unit_price (formatted) when both parse
        //  - else em-dash placeholder
        const qtyNum = parseFloat(row.quantity || '1')
        const unitNum = parseFloat(row.unit_price)
        const rightValue =
          row.line_total !== ''
            ? row.line_total
            : row.unit_price !== '' && !isNaN(unitNum) && !isNaN(qtyNum)
              ? formatAmount(qtyNum * unitNum)
              : '—'

        const formId = `item-${index}-form`
        const nameId = `item-${index}-name`

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
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
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
                    // so "only the Add path focuses" holds. No useEffect → no setState-in-effect.
                    autoFocus={autoFocusName && !isTouch}
                    onFocus={() => {
                      if (justAddedIndex === index) setJustAddedIndex(null)
                    }}
                    className={`${inputClass} max-sm:min-h-[44px]`}
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
