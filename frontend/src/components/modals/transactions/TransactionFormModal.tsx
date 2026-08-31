import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, Plus, Trash2, Upload, Loader2, CloudOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import { listboxPanelClass } from '../../common/listboxParts'
import { controlHeightClass, destructiveButtonClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

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

const TYPE_OPTIONS = [
  { value: 'expense', labelKey: 'type.expense' },
  { value: 'income', labelKey: 'type.income' },
  { value: 'adjustment', labelKey: 'type.adjustment' },
] as const

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

/** Sentinel Select value for "no account" - the shared Select cannot hold a
 * null-valued option, and 0 can never collide with a real account id. */
const NO_ACCOUNT = 0

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
  const { t } = useTranslation('transactions')
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
  const descListId = useId()
  const noteId = useId()

  const defaultBudgetId =
    budgets.length === 1 ? budgets[0].id : (budgets.find((b) => b.id === workspace?.default_budget_id)?.id ?? null)

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [currencyCode, setCurrencyCode] = useState<string | null>(null)
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
  // Description autocomplete: keyboard highlight index into `suggestions`
  // (-1 = none) and the panel-open flag (follows focus/typing, closed on
  // Escape/Tab/select/blur). Reset in the open-effect and on type change.
  const [highlighted, setHighlighted] = useState(-1)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  // Optional note, hidden behind an "Add note" disclosure so the form's
  // common path stays compact. Opens pre-expanded when the source carries a
  // note - existing data must never sit hidden behind the toggle.
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)

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
      // Currency FIRST: when the parsed code is an enabled currency it becomes
      // the transaction's own currency even if no account matches it (the
      // traveling-cash case - the receipt alone tells us the money's currency).
      // The account pick below then locks the same code when a matching account
      // exists; no match leaves this code selected and the currency editable.
      // Canonical casing comes from the enabled list, not the raw parse.
      const parsedEnabled = currencies.find(
        (c) => c.code.toUpperCase() === result.currency?.toUpperCase(),
      )
      if (parsedEnabled) setCurrencyCode(parsedEnabled.code)
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
    onError: (error) => toast.error(getApiErrorMessage(error, t('form.parseFailedFallback'))),
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
    // Suggestion panel starts closed for every fresh open.
    setHighlighted(-1)
    setSuggestionsOpen(false)
    // Copy mode prefills like edit, except the date: always today (D4).
    const source = transaction ?? copyFrom
    if (source) {
      setDate(transaction ? source.date : new Date().toISOString().slice(0, 10))
      setDescription(source.description)
      setNote(source.note ?? '')
      setNoteOpen(!!source.note)
      setType(source.type)
      setAmount(source.amount)
      setAccountId(source.account_id)
      setCurrencyCode(source.currency_code)
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
      setNote('')
      setNoteOpen(false)
      setType('expense')
      setAmount('')
      // Single-account workspaces prefill the only account (a client-side
      // convenience - the backend no longer defaults); its currency locks the
      // form. Everything else starts account-less on the primary currency.
      setAccountId(accounts.length === 1 ? accounts[0].id : null)
      setCurrencyCode(accounts.length === 1 ? accounts[0].currency_code : (currencies[0]?.code ?? null))
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
        const parsedEnabled = currencies.find(
          (c) => c.code.toUpperCase() === parsed.currency?.toUpperCase(),
        )
        if (parsedEnabled) setCurrencyCode(parsedEnabled.code)
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
        // Currency seeding above has the same stale-state shape: it derives
        // from `parsed` and `currencies` directly instead of reading any
        // just-set state, for the same reason as the account pick below.
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
  }, [open, transaction, copyFrom, accounts.length, budgets.length, currencies.length, defaultBudgetId, prefillReceipt])

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => budgetsApi.listCategories(budgetId!),
    enabled: open && !!budgetId && type !== 'adjustment',
  })

  // Frequent descriptions for the description autocomplete, cached per type.
  // Keyed inside the ['transactions'] family so every transaction mutation's
  // invalidation (including this form's own save) refetches it - a
  // just-saved description shows up in the next open's suggestions.
  const { data: freq } = useQuery({
    queryKey: ['transactions', 'frequent-descriptions', type],
    queryFn: () => transactionsApi.getFrequentDescriptions({ transaction_type: [type], limit: 6 }),
    enabled: open && description.trim().length >= 2,
    staleTime: 60_000,
  })

  // Substring matches of what is typed, excluding the exact match (typing a
  // remembered description verbatim needs no suggestion). Never auto-applied:
  // a suggestion lands in the field only on explicit Enter or click.
  const suggestions = (freq?.items ?? [])
    .filter((s) => {
      const q = description.trim().toLowerCase()
      return s.description.toLowerCase().includes(q) && s.description.toLowerCase() !== q
    })
    .slice(0, 6)
  const showSuggestions =
    open && suggestionsOpen && suggestions.length > 0 && description.trim().length >= 2

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        date,
        description: description.trim(),
        // Always sent, even as null: update is full-replace - an absent key
        // would silently clear a stored note.
        note: note.trim() || null,
        type,
        amount,
        account_id: accountId,
        currency_code: currencyCode,
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
        toast.error(t('form.uploadFailedPartial'))
      } else {
        toast.success(isEdit ? t('form.updated') : t('form.added'))
      }
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('form.saveFailed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return toast.error(t('form.descriptionRequired'))
    if (!amount) return toast.error(t('form.amountRequired'))
    if (type === 'adjustment' && !accountId) return toast.error(t('form.adjustmentNeedsAccount'))
    if (!currencyCode) return toast.error(t('form.chooseCurrency'))
    mutation.mutate()
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))
  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const typeOptions = TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))
  // Adjustments must book to an account (an account-less adjustment moves no
  // balance), so the sentinel disappears from the option list for them; a
  // stale null accountId then simply shows the placeholder.
  const accountSelectOptions =
    type === 'adjustment'
      ? accountOptions
      : [{ value: NO_ACCOUNT, label: t('noAccount') }, ...accountOptions]
  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))
  const otherCurrencyOptions = useMemo(
    () => currencies.filter((c) => c.code !== currencyCode).map((c) => ({ value: c.code, label: c.code })),
    [currencies, currencyCode],
  )

  /** Picking a real account locks the currency to the account's (changing the
      currency means changing the account). Re-selecting the sentinel clears the
      account but KEEPS the currency - it just becomes editable again. */
  const handleAccountChange = (value: number) => {
    if (value === NO_ACCOUNT) {
      setAccountId(null)
      return
    }
    setAccountId(value)
    const next = accounts.find((a) => a.id === value)
    if (next) setCurrencyCode(next.currency_code)
  }

  /** Combobox keyboard semantics for the description field (mirrors
   *  useListboxPanel): arrows move the highlight with wrap, Enter accepts the
   *  highlighted suggestion (preventDefault - no form submit) or falls through
   *  natively so the typed text submits as-is, Escape/Tab close the panel.
   *  Escape is consumed (stopPropagation) so the surrounding Modal does not
   *  also close - same rationale as the listbox panels. */
  const handleDescriptionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlighted((prev) => (prev < 0 ? 0 : (prev + 1) % suggestions.length))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlighted((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
        break
      case 'Enter':
        // Bounds check: a mid-flight refetch can shrink the list under a
        // highlight set against the previous render's rows.
        if (highlighted >= 0 && highlighted < suggestions.length) {
          e.preventDefault()
          setDescription(suggestions[highlighted].description)
          setSuggestionsOpen(false)
          setHighlighted(-1)
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        setSuggestionsOpen(false)
        break
      case 'Tab':
        setSuggestionsOpen(false)
        break
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="p-6 max-h-[90vh] overflow-y-auto" title={isEdit ? t('form.editTitle') : t('form.newTitle')}>
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
              title={extractionReachable ? undefined : t('form.scannerOfflineTitle')}
              className={`${secondaryButtonClass} disabled:hover:bg-surface inline-flex items-center gap-1`}
            >
              {parse.isPending ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> {t('form.reading')}
                </>
              ) : extractionReachable ? (
                <>
                  <Upload size={13} /> {t('form.uploadReceipt')}
                </>
              ) : (
                <>
                  <CloudOff size={13} /> {t('form.scanningOffline')}
                </>
              )}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('form.typeLabel')}</label>
            <Select
              value={type}
              onChange={(v) => {
                setType(v)
                // Suggestions are per-type: the panel stays closed until the
                // new type's list arrives and the user interacts again.
                setHighlighted(-1)
                setSuggestionsOpen(false)
              }}
              options={typeOptions}
              aria-label={t('form.typeAria')}
            />
          </div>
          <div>
            <label htmlFor="tx-amount" className={labelClass}>
              {type === 'adjustment' ? t('form.deltaAmountLabel') : t('form.amountLabel')} {currencyCode ? `(${currencyCode})` : ''}
            </label>
            <input id="tx-amount" type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus={!isTouch} />
          </div>
        </div>

        <div>
          <label htmlFor="tx-desc" className={labelClass}>{t('form.descriptionLabel')}</label>
          <div className="relative">
            <input
              id="tx-desc"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                // Re-filtering moves the rows; a stale highlight could point
                // past the end of the shrunken list.
                setHighlighted(-1)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              // Delayed close: clicking a suggestion row blurs the input
              // first - closing synchronously would unmount the row before
              // the click lands.
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
              onKeyDown={handleDescriptionKeyDown}
              className={inputClass}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls={showSuggestions ? descListId : undefined}
              aria-activedescendant={highlighted >= 0 ? `${descListId}-opt-${highlighted}` : undefined}
            />
            {showSuggestions && (
              // max-w-full caps the fit-widest panel at the description
              // field's width - frequent descriptions can be arbitrarily
              // long (max-width clamps width regardless of class order).
              <div id={descListId} role="listbox" aria-label={t('form.frequentAria')} className={listboxPanelClass + ' max-w-full'}>
                {suggestions.map((s, i) => (
                  <button
                    key={s.description}
                    id={`${descListId}-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === highlighted}
                    tabIndex={-1}
                    onClick={() => {
                      setDescription(s.description)
                      setSuggestionsOpen(false)
                      setHighlighted(-1)
                    }}
                    className={
                      'w-full flex items-center px-2 text-left text-xs text-text transition-colors ' +
                      `${controlHeightClass} ` +
                      (i === highlighted ? 'bg-surface-hover ' : 'hover:bg-surface-hover ')
                    }
                  >
                    <span className="truncate">{s.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Note disclosure (accordion wiring: the collapsed toggle carries
            aria-expanded + aria-controls; the field region is its sibling).
            Collapsed by default so the form stays compact; the textarea
            replaces the button once opened. */}
        {noteOpen ? (
          <div id={noteId} role="region" aria-label={t('form.noteAria')}>
            <label htmlFor="tx-note" className={labelClass}>{t('form.noteLabel')}</label>
            <textarea
              id="tx-note"
              rows={3}
              /* Mirrors the backend note max_length: an over-long note is
                 stopped at input, not rejected with a 422 on save. */
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            aria-expanded={noteOpen}
            aria-controls={noteId}
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors max-sm:min-h-[44px]"
          >
            <Plus size={13} /> {t('form.addNote')}
          </button>
        )}

        {/* Always rendered: recording money without an account (cash exchanged
            while traveling, a closed account's history) is a first-class path. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('form.accountLabel')}</label>
            <Select
              value={accountId ?? NO_ACCOUNT}
              onChange={handleAccountChange}
              options={accountSelectOptions}
              placeholder={t('form.selectAccount')}
              aria-label={t('form.accountAria')}
            />
          </div>
          <div>
            <label className={labelClass}>{t('form.currencyLabel')}</label>
            <Select
              value={currencyCode}
              onChange={setCurrencyCode}
              options={currencyOptions}
              placeholder={t('form.currencyPlaceholder')}
              aria-label={t('form.currencyAria')}
              disabled={accountId !== null}
              mono
            />
          </div>
        </div>

        {type !== 'adjustment' && (
          <div className="grid grid-cols-2 gap-3">
            {budgets.length > 1 && (
              <div>
                <label className={labelClass}>{t('form.budgetLabel')}</label>
                <Select value={budgetId} onChange={(v) => { setBudgetId(v); setCategoryId(null) }} options={budgetOptions} placeholder={t('form.budgetPlaceholder')} aria-label={t('form.budgetAria')} />
              </div>
            )}
            <div className={budgets.length > 1 ? '' : 'col-span-2'}>
              <label className={labelClass}>{t('form.categoryLabel')}</label>
              <Select value={categoryId} onChange={setCategoryId} options={categoryOptions} placeholder={t('form.uncategorized')} aria-label={t('form.categoryAria')} disabled={!budgetId} />
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>{t('form.dateLabel')}</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        {type !== 'adjustment' && otherCurrencyOptions.length > 0 && (
          <div>
            <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input type="checkbox" checked={otherCurrency} onChange={(e) => setOtherCurrency(e.target.checked)} />
              {t('form.otherCurrency')}
            </label>
            {otherCurrency && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input type="number" inputMode="decimal" step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} placeholder={t('form.originalAmountPlaceholder')} className={inputClass} />
                <Select value={originalCurrencyCode} onChange={setOriginalCurrencyCode} options={otherCurrencyOptions} placeholder={t('form.currencyPlaceholder')} aria-label={t('form.originalCurrencyAria')} mono />
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
            currencyCode={currencyCode}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {/* Two separate, individually clickable actions (never a menu). */}
          {isEdit && transaction && (
            <div className="flex items-center gap-2">
              {onCopy && (
                <button type="button" onClick={() => onCopy(transaction)} className={secondaryButtonClass}>
                  <Copy size={13} className="inline mr-1" /> {t('form.copy')}
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(transaction)} className={destructiveButtonClass}>
                  <Trash2 size={13} className="inline mr-1" /> {t('form.delete')}
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('form.cancel')}</button>
            <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
              {mutation.isPending ? t('form.saving') : isEdit ? t('form.save') : t('form.add')}
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
                {t(tab === 'items' ? 'form.tabs.items' : 'form.tabs.receipts')}
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
