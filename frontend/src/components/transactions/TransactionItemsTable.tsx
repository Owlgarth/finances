import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import { formatAmount } from '../../utils/format'

export interface Row {
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

const emptyRow = (): Row => ({ name: '', quantity: '1', unit_price: '', line_total: '' })

const cellClass =
  'w-full bg-surface-hover border border-border rounded-none px-2 py-1 font-mono text-xs text-text focus:ring-2 focus:ring-border-focus focus:outline-none'

/** Sum of line totals, falling back to quantity × unit price — mirrors the backend. */
function computeTotal(rows: Row[]): number {
  return rows.reduce((sum, r) => {
    if (r.line_total !== '') return sum + (parseFloat(r.line_total) || 0)
    if (r.unit_price !== '') return sum + (parseFloat(r.quantity || '1') || 0) * (parseFloat(r.unit_price) || 0)
    return sum
  }, 0)
}

export default function TransactionItemsTable({ rows, onChange, amount, currencyCode }: Props) {
  const updateRow = (index: number, patch: Partial<Row>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index))
  const move = (index: number, delta: number) => {
    const next = [...rows]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
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
      {rows.length > 0 && (
        <div className="border border-border rounded-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[9px] font-mono uppercase tracking-widest text-text-muted border-b border-border">
                <th className="text-left px-2 py-1.5">Item</th>
                <th className="px-2 py-1.5 w-16">Qty</th>
                <th className="px-2 py-1.5 w-20">Unit</th>
                <th className="px-2 py-1.5 w-20">Total</th>
                <th className="px-2 py-1.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="px-2 py-1">
                    <input value={row.name} onChange={(e) => updateRow(index, { name: e.target.value })} className={cellClass} placeholder="Name" />
                  </td>
                  <td className="px-2 py-1">
                    <input value={row.quantity} onChange={(e) => updateRow(index, { quantity: e.target.value })} className={cellClass} inputMode="decimal" />
                  </td>
                  <td className="px-2 py-1">
                    <input value={row.unit_price} onChange={(e) => updateRow(index, { unit_price: e.target.value })} className={cellClass} inputMode="decimal" placeholder="—" />
                  </td>
                  <td className="px-2 py-1">
                    <input value={row.line_total} onChange={(e) => updateRow(index, { line_total: e.target.value })} className={cellClass} inputMode="decimal" placeholder="—" />
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-0.5 text-text-muted">
                      <button type="button" onClick={() => move(index, -1)} className="hover:text-text p-0.5" aria-label="Move up"><ChevronUp size={12} /></button>
                      <button type="button" onClick={() => move(index, 1)} className="hover:text-text p-0.5" aria-label="Move down"><ChevronDown size={12} /></button>
                      <button type="button" onClick={() => removeRow(index)} className="hover:text-negative p-0.5" aria-label="Remove"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => onChange([...rows, emptyRow()])} className="text-xs text-primary hover:text-primary-hover inline-flex items-center gap-1">
          <Plus size={12} /> Add item
        </button>
        {rows.some((r) => r.name.trim()) && (
          <span className="text-xs font-mono text-text-muted">
            {currencyCode ? `Items: ${formatAmount(itemsTotal)} ${currencyCode}` : `Items: ${formatAmount(itemsTotal)}`}
          </span>
        )}
      </div>

      {mismatch && (
        <p className="text-xs text-warning inline-flex items-center gap-1">
          <AlertTriangle size={12} /> Items total ({formatAmount(itemsTotal)}) doesn’t match the transaction amount ({formatAmount(absAmount)}).
        </p>
      )}
    </div>
  )
}
