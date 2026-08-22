import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, Trash2, Upload, Loader2, CloudOff } from 'lucide-react'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../DatePicker'
import TransactionItemsEditor from '../../transactions/TransactionItemsEditor'
import TransactionItemsList, { type Row } from '../../transactions/TransactionItemsList'
import TransactionAttachments from '../../transactions/TransactionAttachments'
import { budgetsApi, transactionsApi } from '../../../api/client'
import type { Account, ParsedReceipt, Transaction, TransactionItemInput, TransactionType } from '../../../types'
import { useAccounts, useBudgets, useEnabledCurrencies, useExtractionConfig } from '../../../hooks/useDomain'
import { useIsTouch } from '../../../hooks/useBreakpoint'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../../utils/errors'
import { rowsToItems } from '../../../utils/transactionItems'
import { destructiveButtonClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  transaction?: Transaction | null
  /** Copy mode: prefill every field from this transaction except the date
      (today instead) and save as a NEW transaction. Ignored while editing. */
  copyFrom?: Transaction | null
  /** Edit mode only: renders a Delete button in the footer. Caller owns the
      confirm flow (and closing this modal). */
  onDelete?: (transaction: Transaction) => void
  /** Edit mode only: renders a Copy button in the footer. Caller switches the
      modal into copy mode (transaction=null, copyFrom=t). */
  onCopy?: (transaction: Transaction) => void
  /** Receipt-first create entry (BottomNav "From receipt"): seeds amount/date/
      description + the editable items list + the pending attachment from an
      *already-parsed* receipt. Set once by the parent on parse success and
      cleared on close, so the reference is stable while open (no mid-edit
      re-seed). Ignored unless create mode (no transaction/copyFrom). */
  prefillReceipt?: { file: File; parsed: ParsedReceipt } | null
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'adjustment', label: 'Adjustment' },
]

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

/** TransactionItemInput[] (API payload shape) → Row[] (table editing shape). */
const itemsToRows = (items: TransactionItemInput[]): Row[] =>
  items.map((i) => ({
    id: crypto.randomUUID(),
    name: i.name,
    quantity: i.quantity ?? '1',
    unit_price: i.unit_price ?? '',
    line_total: i.line_total ?? '',
  }))

/** Pick the account id whose currency matches `currencyCode`, preferring the
 * per-currency default-flagged account and falling back to the first account
 * by the backend's `display_order, name` ordering (the list endpoint already
 * returns them in that order, so `matches[0]` is the first by ordering).
 * Returns null when `currencyCode` is falsy/empty or no account matches.
 * Pure — safe to call inline from a mutation callback or effect. */
const pickAccountForCurrency = (
  accounts: Account[],
  currencyCode: string | null | undefined,
): number | null => {
  if (!currencyCode) return null
  const code = currencyCode.toUpperCase()
  const matches = accounts.filter((a) => a.currency_code.toUpperCase() === code)
  if (matches.length === 0) return null
  return matches.find((a) => a.is_default_for_currency)?.id ?? matches[0].id
}

export default function TransactionFormModal({ open, onClose, transaction, copyFrom, onDelete, onCopy, prefillReceipt = null }: Props) {
  const isEdit = !!transaction
  const queryClient = useQueryClient()
  // No autofocus on touch: focusing an input on open yanks the keyboard up
  // over the fresh modal. The user taps the field they want first.
  const isTouch = useIsTouch()
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
  // Rows are the editing source of truth in create mode (nameless rows, '' qty
  // mid-edit, etc. survive). Normalization to the API payload shape happens
  // once, at submit (rowsToItems, utils/transactionItems). Mirrors TransactionItemsEditor.
  const [pendingRows, setPendingRows] = useState<Row[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  const parse = useMutation({
    mutationFn: (f: File) => transactionsApi.parseReceipt(f),
    onSuccess: (result: ParsedReceipt, file: File) => {
      setPendingFile(file)
      // One-time conversion: parsed items carry extra fields (confidence, etc.)
      // that must not leak into rows — itemsToRows picks exactly the four row
      // fields, and ParsedReceiptItem is structurally assignable to
      // TransactionItemInput, so no strip-map is needed. After this, rows live
      // as Row[] until submit.
      setPendingRows(itemsToRows(result.items))
      setAmount(result.total ?? '')
      if (result.date) setDate(result.date)
      // Merchant fills description only when the user hasn't typed one — matches
      // ExtractionReviewModal's rule, simplified because this form's create-mode
      // default is '' (not 'Receipt').
      if (description === '' && result.merchant) setDescription(result.merchant)
      // Auto-select the account whose currency matches the parsed receipt —
      // prefer the per-currency default-flagged account, else the first by
      // ordering. `useMutation` recreates this callback each render, so
      // `accounts` and `accountId` are this render's current values. Do NOT
      // override an account whose currency already matches (a deliberate user
      // pick is respected). Read the current account's currency via
      // `accounts.find(...)` rather than the L210 `account` const (declared
      // after this mutation — referencing it here is a temporal-dead-zone
      // ReferenceError; the explicit find is mandatory, not stylistic).
      const pick = pickAccountForCurrency(accounts, result.currency)
      if (
        pick !== null &&
        accounts.find((a) => a.id === accountId)?.currency_code?.toUpperCase() !== result.currency?.toUpperCase()
      ) {
        setAccountId(pick)
      }
    },
    // A 503 here means the self-hosted scanner is off — the backend's detail
    // already says so, so surface it rather than a generic error.
    onError: (error) => toast.error(getApiErrorMessage(error, 'Could not read the receipt')),
  })

  const handleFile = (f: File | null) => {
    if (!f) return
    parse.mutate(f)
    // Same-file reselect must re-fire onChange; the File object is already
    // captured by parse.mutate, so clearing the input value is safe. Without
    // this, re-selecting the same file fires no change event (silent no-op).
    if (fileRef.current) fileRef.current.value = ''
  }

  useEffect(() => {
    if (!open) return
    // Clear any receipt-upload state from a previous session.
    setPendingFile(null)
    setPendingRows([])
    parse.reset()
    if (fileRef.current) fileRef.current.value = ''
    setDetailTab(null)
    // Copy mode prefills like edit, except the date: always today (D4).
    const source = transaction ?? copyFrom
    if (source) {
      setDate(transaction ? source.date : new Date().toISOString().slice(0, 10))
      setDescription(source.description)
      setType(source.type)
      setAmount(source.amount)
      setAccountId(source.account_id)
      setCategoryId(source.category_id)
      setOtherCurrency(!!source.original_currency_code)
      setOriginalAmount(source.original_amount ?? '')
      setOriginalCurrencyCode(source.original_currency_code)
      // Uncategorized source → fall back to the create-mode default budget so the
      // Category select is immediately usable (it is disabled while budgetId is
      // null, and the Budget select below only renders for multi-budget
      // workspaces). Mirrors the create branch's setBudgetId(defaultBudgetId).
      setBudgetId(source.category_budget_id ?? defaultBudgetId)
      // Edit mode bypasses the idempotency-key dedup — only create-mode
      // submissions carry a key (Q5=A: no items on update, same rationale).
      // Copy mode IS a create, so it gets a fresh key like the else branch.
      setIdempotencyKey(transaction ? null : crypto.randomUUID())
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
      // Fresh key per open in create mode. Persists across mutation retries
      // within this open session — that's what makes a double-click or a
      // network-blip replay return the original 201 instead of a duplicate.
      setIdempotencyKey(crypto.randomUUID())

      // Receipt-first entry (BottomNav "From receipt"): seed from an
      // already-parsed receipt. Mirrors parse.onSuccess's seeding (above) but
      // runs at open time. prefillReceipt is set once by the parent on parse
      // success and cleared on close, so it cannot re-seed mid-edit. Merchant
      // fills description unconditionally here because the line above just set
      // it to '' (CODING_SUMMARIES T18 — create-mode default is ''). Do NOT
      // touch the inline "Upload invoice/receipt" button below; it stays
      // functional for an in-place re-scan after prefill.
      if (prefillReceipt) {
        const { file, parsed } = prefillReceipt
        setPendingFile(file)
        setPendingRows(itemsToRows(parsed.items))
        setAmount(parsed.total ?? '')
        if (parsed.date) setDate(parsed.date)
        setDescription(parsed.merchant ?? '')
        // Auto-select the account whose currency matches the parsed receipt —
        // mirrors parse.onSuccess. STALE-STATE NOTE: the `setAccountId(...)`
        // at L170 above has NOT flushed yet within this same effect run (state
        // reads inside an effect reflect the render that created the effect, not
        // mid-effect setStates). So reading `accountId` here would be stale.
        // Instead, recompute the L170 "intended current account id" locally and
        // compare against that — this is the value accountId will hold once the
        // effect's setStates flush. If a matching account exists and that
        // intended account's currency doesn't already match the receipt's
        // currency, override to the pick.
        const currentAccountId = accounts.length === 1 ? accounts[0].id : null
        const pick = pickAccountForCurrency(accounts, parsed.currency)
        if (
          pick !== null &&
          accounts.find((a) => a.id === currentAccountId)?.currency_code?.toUpperCase() !== parsed.currency?.toUpperCase()
        ) {
          setAccountId(pick)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, copyFrom, accounts.length, budgets.length, defaultBudgetId, prefillReceipt])

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
        const trans = await transactionsApi.update(transaction.id, payload)
        // Edit mode never uploads an attachment here — uniform return shape so
        // onSuccess can destructure { uploadFailed } for both branches.
        return { trans, uploadFailed: false }
      }
      // Inline the items on the create call (Task 1 backend) and send the
      // idempotency key as a header (Task 2 backend). This is the atomic
      // tx + items commit — once it returns, the data is durable.
      const trans = await transactionsApi.create(
        { ...payload, items: rowsToItems(pendingRows) },
        { idempotencyKey: idempotencyKey ?? undefined },
      )
      // Attachment upload is best-effort: the tx and its items are already
      // committed. A failure here (e.g. S3 blip) is no longer fatal — report
      // it via the return value so onSuccess surfaces ONE message, not a
      // mid-flight error toast followed by a success toast. The user can
      // re-add the receipt in edit mode.
      let uploadFailed = false
      try {
        if (pendingFile) await transactionsApi.uploadAttachment(trans.id, pendingFile)
      } catch {
        uploadFailed = true
      }
      return { trans, uploadFailed }
    },
    onSuccess: ({ uploadFailed }) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      // The transaction IS durable either way — invalidations + close run in
      // both cases. Only the message differs: a single error vs a single success.
      if (uploadFailed) {
        toast.error('Transaction saved, but the receipt upload failed — you can add it from the edit screen.')
      } else {
        toast.success(isEdit ? 'Transaction updated' : 'Transaction added')
      }
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
    <Modal open={open} onClose={onClose} className="p-6 max-h-[90vh] overflow-y-auto" title={isEdit ? 'Edit transaction' : 'New transaction'}>
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
            <input id="tx-amount" type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus={!isTouch} />
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

        {/* Editable line items — create mode only. Edit mode has its own items tab below. */}
        {!isEdit && (
          <TransactionItemsList
            rows={pendingRows}
            onChange={setPendingRows}
            amount={amount}
            currencyCode={account?.currency_code ?? null}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {/* Two separate, individually clickable actions (never a menu). */}
          {isEdit && transaction && (
            <div className="flex items-center gap-2">
              {onCopy && (
                <button type="button" onClick={() => onCopy(transaction)} className={secondaryButtonClass}>
                  <Copy size={13} className="inline mr-1" /> Copy
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(transaction)} className={destructiveButtonClass}>
                  <Trash2 size={13} className="inline mr-1" /> Delete
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
            <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add'}
            </button>
          </div>
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
