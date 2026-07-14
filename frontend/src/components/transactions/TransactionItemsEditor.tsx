import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, Trash2, ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import { transactionsApi } from '../../api/client'
import type { Transaction, TransactionItemInput } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import { formatAmount } from '../../utils/format'
import { primaryButtonClass } from '../common/formStyles'

interface Props {
  transaction: Transaction
}

interface Row {
  name: string
  quantity: string
  unit_price: string
  line_total: string
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

export default function TransactionItemsEditor({ transaction }: Props) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['transaction-items', transaction.id],
    queryFn: () => transactionsApi.listItems(transaction.id),
  })

  useEffect(() => {
    if (data) {
      setRows(
        data.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price ?? '',
          line_total: i.line_total ?? '',
        })),
      )
    }
  }, [data])

  const save = useMutation({
    mutationFn: () => {
      const payload: TransactionItemInput[] = rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name.trim(),
          quantity: r.quantity || '1',
          unit_price: r.unit_price === '' ? null : r.unit_price,
          line_total: r.line_total === '' ? null : r.line_total,
        }))
      return transactionsApi.replaceItems(transaction.id, payload)
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['transaction-items', transaction.id] })
      toast.success('Items saved')
      setRows(
        res.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price ?? '',
          line_total: i.line_total ?? '',
        })),
      )
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to save items')),
  })

  const updateRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index))
  const move = (index: number, delta: number) =>
    setRows((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const itemsTotal = computeTotal(rows)
  const amount = Math.abs(parseFloat(transaction.amount) || 0)
  const mismatch = rows.some((r) => r.name.trim()) && Math.abs(itemsTotal - amount) > 0.01

  if (isLoading) return <div className="h-16 bg-surface-muted rounded-sm animate-pulse" />

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
        <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])} className="text-xs text-primary hover:text-primary-hover inline-flex items-center gap-1">
          <Plus size={12} /> Add item
        </button>
        {rows.some((r) => r.name.trim()) && (
          <span className="text-xs font-mono text-text-muted">
            Items: {formatAmount(itemsTotal)} {transaction.currency_code}
          </span>
        )}
      </div>

      {mismatch && (
        <p className="text-xs text-warning inline-flex items-center gap-1">
          <AlertTriangle size={12} /> Items total ({formatAmount(itemsTotal)}) doesn’t match the transaction amount ({formatAmount(amount)}).
        </p>
      )}

      <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className={primaryButtonClass}>
        {save.isPending ? 'Saving…' : 'Save items'}
      </button>
    </div>
  )
}
