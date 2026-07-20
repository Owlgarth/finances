import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle } from 'lucide-react'
import Modal from '../common/Modal'
import { transactionsApi } from '../../api/client'
import type { ParsedReceipt, Transaction, TransactionItemInput } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import { primaryButtonClass, secondaryButtonClass, modalTitleClass } from '../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  transaction: Transaction
  parsed: ParsedReceipt
}

const LOW_CONFIDENCE = 0.7
const cellClass =
  'w-full bg-surface-hover border border-border rounded-none px-2 py-1 font-mono text-xs text-text focus:ring-2 focus:ring-border-focus focus:outline-none'

interface Row {
  name: string
  quantity: string
  unit_price: string
  line_total: string
  confidence: number
}

/** Review a parsed receipt, edit low-confidence rows, then replace or append line items. */
export default function ExtractionReviewModal({ open, onClose, transaction, parsed }: Props) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[]>(
    parsed.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit_price: i.unit_price ?? '',
      line_total: i.line_total ?? '',
      confidence: i.confidence,
    })),
  )

  const toInputs = (): TransactionItemInput[] =>
    rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        quantity: r.quantity || '1',
        unit_price: r.unit_price === '' ? null : r.unit_price,
        line_total: r.line_total === '' ? null : r.line_total,
      }))

  // The parsed merchant becomes the transaction description only when the user
  // never gave one — blank, or the receipt-first flow's 'Receipt' placeholder.
  // An intentional description is never overwritten.
  const merchantFillsDescription = (): boolean => {
    const current = transaction.description.trim()
    return Boolean(parsed.merchant) && (current === '' || current === 'Receipt')
  }

  const save = useMutation({
    mutationFn: async (mode: 'replace' | 'append') => {
      let items = toInputs()
      if (mode === 'append') {
        const existing = await transactionsApi.listItems(transaction.id)
        const current: TransactionItemInput[] = existing.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          line_total: i.line_total,
        }))
        items = [...current, ...items]
      }
      const saved = await transactionsApi.replaceItems(transaction.id, items)
      if (merchantFillsDescription()) {
        await transactionsApi.update(transaction.id, {
          date: transaction.date,
          description: parsed.merchant!,
          type: transaction.type,
          amount: transaction.amount,
          account_id: transaction.account_id,
          category_id: transaction.category_id,
          original_amount: transaction.original_amount,
          original_currency_code: transaction.original_currency_code,
        })
      }
      return saved
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-items', transaction.id] })
      if (merchantFillsDescription()) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] })
      }
      toast.success('Items saved from receipt')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to save items')),
  })

  const updateRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const flag = (value: string | null, confidence: number) =>
    value && confidence < LOW_CONFIDENCE ? (
      <span className="ml-1 text-warning" title="Low confidence — please verify"><AlertTriangle size={11} className="inline" /></span>
    ) : null

  return (
    <Modal open={open} onClose={onClose} size="lg" className="p-6 max-h-[90vh] overflow-y-auto">
      <h2 className={modalTitleClass}>Review extracted receipt</h2>

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div>
          <span className="text-text-muted">Merchant:</span> {parsed.merchant ?? '—'}
          {flag(parsed.merchant, parsed.confidence.merchant)}
        </div>
        <div>
          <span className="text-text-muted">Date:</span> {parsed.date ?? '—'}
          {flag(parsed.date, parsed.confidence.date)}
        </div>
        <div>
          <span className="text-text-muted">Total:</span>{' '}
          <span className="font-mono">{parsed.total ?? '—'} {parsed.currency ?? ''}</span>
          {flag(parsed.total, parsed.confidence.total)}
        </div>
        <div>
          <span className="text-text-muted">Currency:</span> {parsed.currency ?? '—'}
          {flag(parsed.currency, parsed.confidence.currency)}
        </div>
      </div>

      {parsed.warnings.length > 0 && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning/40 rounded-sm text-xs text-warning">
          <p className="font-medium inline-flex items-center gap-1 mb-1"><AlertTriangle size={12} /> The parser flagged:</p>
          <ul className="list-disc pl-4">
            {parsed.warnings.map((w) => <li key={w}>{w.replace(/_/g, ' ')}</li>)}
          </ul>
        </div>
      )}

      <div className="border border-border rounded-sm overflow-hidden mb-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[9px] font-mono uppercase tracking-widest text-text-muted border-b border-border">
              <th className="text-left px-2 py-1.5">Item</th>
              <th className="px-2 py-1.5 w-16">Qty</th>
              <th className="px-2 py-1.5 w-20">Unit</th>
              <th className="px-2 py-1.5 w-20">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => (
              <tr key={index} className={row.confidence < LOW_CONFIDENCE ? 'bg-warning/5' : ''}>
                <td className="px-2 py-1"><input value={row.name} onChange={(e) => updateRow(index, { name: e.target.value })} className={cellClass} /></td>
                <td className="px-2 py-1"><input value={row.quantity} onChange={(e) => updateRow(index, { quantity: e.target.value })} className={cellClass} /></td>
                <td className="px-2 py-1"><input value={row.unit_price} onChange={(e) => updateRow(index, { unit_price: e.target.value })} className={cellClass} /></td>
                <td className="px-2 py-1"><input value={row.line_total} onChange={(e) => updateRow(index, { line_total: e.target.value })} className={cellClass} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-2 py-4 text-center text-text-muted">No line items detected.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
        <button type="button" onClick={() => save.mutate('append')} disabled={save.isPending || rows.length === 0} className={secondaryButtonClass}>
          Append to items
        </button>
        <button type="button" onClick={() => save.mutate('replace')} disabled={save.isPending || rows.length === 0} className={primaryButtonClass}>
          {save.isPending ? 'Saving…' : 'Replace items'}
        </button>
      </div>
    </Modal>
  )
}
