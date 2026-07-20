import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, Loader2, AlertTriangle } from 'lucide-react'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../DatePicker'
import { budgetsApi, transactionsApi } from '../../../api/client'
import type { ParsedReceipt } from '../../../types'
import { useAccounts, useBudgets } from '../../../hooks/useDomain'
import { getApiErrorMessage } from '../../../utils/errors'
import { formatAmount } from '../../../utils/format'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
}

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

/**
 * Receipt-first creation (R6): upload -> parse (nothing persisted) -> pre-filled
 * form -> on confirm, create the transaction, attach the file, and save items.
 * Cancel at any point leaves no residue (no draft transaction, no stored file).
 */
export default function NewFromReceiptModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null)
  const [accountId, setAccountId] = useState<number | null>(accounts.length === 1 ? accounts[0].id : null)
  const [budgetId, setBudgetId] = useState<number | null>(budgets.length === 1 ? budgets[0].id : null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID())

  const reset = () => {
    setFile(null); setParsed(null); setCategoryId(null); setDescription(''); setAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    if (fileRef.current) fileRef.current.value = ''
    // Fresh key for the next open session. reset() fires on close (via
    // close()), so the next time the user opens this modal the create
    // mutation will send a new key — preserving dedup semantics within an
    // open session while preventing stale keys from one session leaking
    // into the next.
    setIdempotencyKey(crypto.randomUUID())
  }
  const close = () => { reset(); onClose() }

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => budgetsApi.listCategories(budgetId!),
    enabled: open && !!budgetId,
  })

  const parse = useMutation({
    mutationFn: (f: File) => transactionsApi.parseReceipt(f),
    onSuccess: (result: ParsedReceipt) => {
      setParsed(result)
      setDescription(result.merchant ?? '')
      setAmount(result.total ?? '')
      if (result.date) setDate(result.date)
    },
    // A 503 here means the self-hosted scanner is off, not a bad receipt — the
    // backend's detail already says so, so surface it rather than a generic error.
    onError: (error) => toast.error(getApiErrorMessage(error, 'Could not read the receipt')),
  })

  const create = useMutation({
    mutationFn: async () => {
      // Inline the parsed items on the create call (Task 1 backend) and send
      // the idempotency key as a header (Task 2 backend). Atomic tx + items
      // commit in a single round-trip.
      const trans = await transactionsApi.create(
        {
          date,
          description: description.trim() || 'Receipt',
          type: 'expense',
          amount,
          account_id: accountId,
          category_id: categoryId,
          items:
            parsed && parsed.items.length > 0
              ? parsed.items.map((i) => ({
                  name: i.name,
                  quantity: i.quantity,
                  unit_price: i.unit_price,
                  line_total: i.line_total,
                }))
              : undefined,
        },
        { idempotencyKey },
      )
      // Best-effort attachment upload — the tx and items are already durable.
      try {
        if (file) await transactionsApi.uploadAttachment(trans.id, file)
      } catch {
        toast.error('Transaction saved, but the receipt upload failed — you can add it from the edit screen.')
      }
      return trans
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success('Transaction created from receipt')
      close()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to create transaction')),
  })

  const handleFile = (f: File | null) => {
    if (!f) return
    setFile(f)
    parse.mutate(f)
  }

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount) return toast.error('Amount is required')
    if (!accountId && accounts.length !== 1) return toast.error('Choose an account')
    create.mutate()
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))
  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))

  return (
    <Modal open={open} onClose={close} className="p-6 max-h-[90vh] overflow-y-auto" title="New transaction from receipt">

      {!parsed ? (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Upload a receipt photo or PDF. We’ll read the total, date and line items so you can review
            and confirm — nothing is saved until you do.
          </p>
          <input ref={fileRef} type="file" accept={ACCEPT} capture="environment" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={parse.isPending} className={`${primaryButtonClass} inline-flex items-center gap-2`}>
            {parse.isPending ? <><Loader2 size={14} className="animate-spin" /> Reading receipt…</> : <><Upload size={14} /> Choose receipt</>}
          </button>
        </div>
      ) : (
        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rf-amount" className={labelClass}>Amount</label>
              <input id="rf-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>

          <div>
            <label htmlFor="rf-desc" className={labelClass}>Description</label>
            <input id="rf-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </div>

          {accounts.length > 1 && (
            <div>
              <label className={labelClass}>Account</label>
              <Select value={accountId} onChange={setAccountId} options={accountOptions} placeholder="Select account" aria-label="Account" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {budgets.length > 1 && (
              <div>
                <label className={labelClass}>Budget</label>
                <Select value={budgetId} onChange={(v) => { setBudgetId(v); setCategoryId(null) }} options={budgetOptions} placeholder="Budget" aria-label="Budget" />
              </div>
            )}
            <div className={budgets.length > 1 ? '' : 'col-span-2'}>
              <label className={labelClass}>Category (optional)</label>
              <Select value={categoryId} onChange={setCategoryId} options={categoryOptions} placeholder="Uncategorized" aria-label="Category" disabled={!budgetId} />
            </div>
          </div>

          {parsed.warnings.length > 0 && (
            <p className="text-xs text-warning inline-flex items-center gap-1">
              <AlertTriangle size={12} /> The parser flagged: {parsed.warnings.map((w) => w.replace(/_/g, ' ')).join(', ')}. Please verify.
            </p>
          )}

          {parsed.items.length > 0 && (
            <div className="text-xs text-text-muted">
              {parsed.items.length} line item{parsed.items.length > 1 ? 's' : ''} will be attached
              {parsed.total ? ` (items total ${formatAmount(parsed.items.reduce((s, i) => s + parseFloat(i.line_total ?? '0'), 0))})` : ''}.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={close} className={secondaryButtonClass}>Cancel</button>
            <button type="submit" disabled={create.isPending} className={primaryButtonClass}>
              {create.isPending ? 'Creating…' : 'Create transaction'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
