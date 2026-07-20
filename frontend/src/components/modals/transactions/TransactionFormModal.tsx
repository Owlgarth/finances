import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload, Loader2, CloudOff } from 'lucide-react'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../DatePicker'
import TransactionItemsEditor from '../../transactions/TransactionItemsEditor'
import TransactionAttachments from '../../transactions/TransactionAttachments'
import { budgetsApi, transactionsApi } from '../../../api/client'
import type { ParsedReceipt, Transaction, TransactionItemInput, TransactionType } from '../../../types'
import { useAccounts, useBudgets, useEnabledCurrencies, useExtractionConfig } from '../../../hooks/useDomain'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../../utils/errors'
import { formatAmount } from '../../../utils/format'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, modalTitleClass } from '../../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  transaction?: Transaction | null
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'adjustment', label: 'Adjustment' },
]

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

export default function TransactionFormModal({ open, onClose, transaction }: Props) {
  const isEdit = !!transaction
  const queryClient = useQueryClient()
  const { workspace } = useWorkspace()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: currencies = [] } = useEnabledCurrencies()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()
  const fileRef = useRef<HTMLInputElement>(null)

  const defaultBudgetId =
    budgets.length === 1 ? budgets[0].id : (budgets.find((b) => b.id === workspace?.default_budget_id)?.id ?? null)

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [budgetId, setBudgetId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [otherCurrency, setOtherCurrency] = useState(false)
  const [originalAmount, setOriginalAmount] = useState('')
  const [originalCurrencyCode, setOriginalCurrencyCode] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState<'items' | 'receipts' | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingItems, setPendingItems] = useState<TransactionItemInput[]>([])
  const [parsedTotal, setParsedTotal] = useState<string | null>(null)

  const parse = useMutation({
    mutationFn: (f: File) => transactionsApi.parseReceipt(f),
    onSuccess: (result: ParsedReceipt, file: File) => {
      setPendingFile(file)
      setPendingItems(
        result.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          line_total: i.line_total,
        })),
      )
      setParsedTotal(result.total)
      setAmount(result.total ?? '')
      if (result.date) setDate(result.date)
      // Merchant fills description only when the user hasn't typed one — matches
      // ExtractionReviewModal's rule, simplified because this form's create-mode
      // default is '' (not 'Receipt').
      if (description === '' && result.merchant) setDescription(result.merchant)
    },
    // A 503 here means the self-hosted scanner is off — the backend's detail
    // already says so, so surface it rather than a generic error.
    onError: (error) => toast.error(getApiErrorMessage(error, 'Could not read the receipt')),
  })

  const handleFile = (f: File | null) => {
    if (!f) return
    parse.mutate(f)
  }

  useEffect(() => {
    if (!open) return
    // Clear any receipt-upload state from a previous session.
    setPendingFile(null)
    setPendingItems([])
    setParsedTotal(null)
    parse.reset()
    if (fileRef.current) fileRef.current.value = ''
    setDetailTab(null)
    if (transaction) {
      setDate(transaction.date)
      setDescription(transaction.description)
      setType(transaction.type)
      setAmount(transaction.amount)
      setAccountId(transaction.account_id)
      setCategoryId(transaction.category_id)
      setOtherCurrency(!!transaction.original_currency_code)
      setOriginalAmount(transaction.original_amount ?? '')
      setOriginalCurrencyCode(transaction.original_currency_code)
      setBudgetId(transaction.category_budget_id)
    } else {
      setDate(new Date().toISOString().slice(0, 10))
      setDescription('')
      setType('expense')
      setAmount('')
      setAccountId(accounts.length === 1 ? accounts[0].id : null)
      setBudgetId(defaultBudgetId)
      setCategoryId(null)
      setOtherCurrency(false)
      setOriginalAmount('')
      setOriginalCurrencyCode(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, accounts.length, budgets.length, defaultBudgetId])

  const account = accounts.find((a) => a.id === accountId)

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => budgetsApi.listCategories(budgetId!),
    enabled: open && !!budgetId && type !== 'adjustment',
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        date,
        description: description.trim(),
        type,
        amount,
        account_id: accountId,
        category_id: type === 'adjustment' ? null : categoryId,
        original_amount: otherCurrency ? originalAmount : null,
        original_currency_code: otherCurrency ? originalCurrencyCode : null,
      }
      if (isEdit) {
        return transactionsApi.update(transaction.id, payload)
      }
      const trans = await transactionsApi.create(payload)
      // Receipt-first add: upload the file, then save the parsed line items.
      // The create has already succeeded by this point — these calls decorate
      // the transaction. Order matches NewFromReceiptModal (attachment first).
      if (pendingFile) await transactionsApi.uploadAttachment(trans.id, pendingFile)
      if (pendingItems.length > 0) {
        await transactionsApi.replaceItems(trans.id, pendingItems)
      }
      return trans
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      toast.success(isEdit ? 'Transaction updated' : 'Transaction added')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to save transaction')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return toast.error('Description is required')
    if (!amount) return toast.error('Amount is required')
    if (!accountId && accounts.length !== 1) return toast.error('Choose an account')
    mutation.mutate()
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))
  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const otherCurrencyOptions = useMemo(
    () => currencies.filter((c) => c.code !== account?.currency_code).map((c) => ({ value: c.code, label: c.code })),
    [currencies, account?.currency_code],
  )

  return (
    <Modal open={open} onClose={onClose} className="p-6 max-h-[90vh] overflow-y-auto">
      <h2 className={modalTitleClass}>{isEdit ? 'Edit transaction' : 'New transaction'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Inline receipt scan — create mode only, hidden when extraction is disabled. */}
        {!isEdit && extractionEnabled && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              capture="environment"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={parse.isPending || !extractionReachable}
              title={extractionReachable ? undefined : 'The receipt scanner is offline right now'}
              className={`${secondaryButtonClass} disabled:hover:bg-surface inline-flex items-center gap-1`}
            >
              {parse.isPending ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Reading…
                </>
              ) : extractionReachable ? (
                <>
                  <Upload size={13} /> Upload invoice/receipt
                </>
              ) : (
                <>
                  <CloudOff size={13} /> Scanning offline
                </>
              )}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Type</label>
            <Select value={type} onChange={setType} options={TYPE_OPTIONS} aria-label="Transaction type" />
          </div>
          <div>
            <label htmlFor="tx-amount" className={labelClass}>
              {type === 'adjustment' ? 'Delta amount' : 'Amount'} {account ? `(${account.currency_code})` : ''}
            </label>
            <input id="tx-amount" type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus />
          </div>
        </div>

        <div>
          <label htmlFor="tx-desc" className={labelClass}>Description</label>
          <input id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>

        {accounts.length > 1 && (
          <div>
            <label className={labelClass}>Account</label>
            <Select value={accountId} onChange={setAccountId} options={accountOptions} placeholder="Select account" aria-label="Account" />
          </div>
        )}

        {type !== 'adjustment' && (
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
        )}

        <div>
          <label className={labelClass}>Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        {type !== 'adjustment' && otherCurrencyOptions.length > 0 && (
          <div>
            <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input type="checkbox" checked={otherCurrency} onChange={(e) => setOtherCurrency(e.target.checked)} />
              Paid in another currency?
            </label>
            {otherCurrency && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input type="number" inputMode="decimal" step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} placeholder="Original amount" className={inputClass} />
                <Select value={originalCurrencyCode} onChange={setOriginalCurrencyCode} options={otherCurrencyOptions} placeholder="Currency" aria-label="Original currency" mono />
              </div>
            )}
          </div>
        )}

        {/* Parsed line-items preview — read-only. Editing happens after create, in edit mode. */}
        {!isEdit && pendingItems.length > 0 && (
          <div className="text-xs text-text-muted">
            {pendingItems.length} line item{pendingItems.length > 1 ? 's' : ''} will be attached
            {parsedTotal
              ? ` (items total ${formatAmount(pendingItems.reduce((s, i) => s + parseFloat(i.line_total ?? '0'), 0))})`
              : ''}
            .
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </form>

      {isEdit && transaction && (
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center gap-1 mb-3">
            {(['items', 'receipts'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDetailTab(tab)}
                className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors ${
                  detailTab === tab ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {detailTab === 'items' && <TransactionItemsEditor transaction={transaction} />}
          {detailTab === 'receipts' && <TransactionAttachments transaction={transaction} />}
        </div>
      )}
    </Modal>
  )
}
