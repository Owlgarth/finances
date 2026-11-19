import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { budgetsApi, transactionsApi } from '../api/client'
import type { Account, ParsedReceipt, Transaction, TransactionItemInput, TransactionType } from '../types'
import { useAccounts, useBudgets, useEnabledCurrencies } from './useDomain'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../utils/errors'
import { normalizeAmountInput } from '../utils/amountInput'
import { NO_ACCOUNT } from '../utils/accountSelect'
import { rowsToItems } from '../utils/transactionItems'
import type { Row } from '../components/transactions/TransactionItemsList'

/**
 * Form state machine for creating, editing, or copying a transaction,
 * extracted from TransactionFormModal so a page can host the same form
 * inline. Owns the field state and its session seeding (render-adjust), the
 * inline receipt parse mutation, the derived option lists, validation, and
 * the save mutation. The HOST owns all DOM: the file input and its refs,
 * focus effects, and the submit-button markup - the hook takes mode
 * discriminators in and returns values, setters, derivations, and a
 * submit() the host awaits and closes on.
 */
export interface UseTransactionFormOptions {
  open: boolean
  transaction?: Transaction | null
  /** Copy mode: prefill every field from this transaction except the date
      (today instead) and save as a NEW transaction. Ignored while editing. */
  copyFrom?: Transaction | null
  /** Receipt-first create entry (BottomNav "From receipt"): seeds amount/date/
      description + the editable items list + the pending attachment from an
      *already-parsed* receipt. Applied at most once per receipt object: the
      parent sets it before flipping open and clears it on close, and a
      receipt arriving while the modal is already open is ignored - it never
      re-seeds mid-edit. Ignored unless create mode (no transaction/copyFrom). */
  prefillReceipt?: { file: File; parsed: ParsedReceipt } | null
  /** Create-mode starting account (the page's account filter): seeds the
   *  account and its currency. Null (the default, the modal's behavior)
   *  starts from the default account of the form's currency instead, else
   *  No account. Ignored unless create mode (no transaction/copyFrom). */
  initialAccountId?: number | null
  /** Create-mode starting type (the /new page's ?type= seed): seeds the
   *  type segmented control. Undefined (the default, the modal's behavior)
   *  starts on expense. Ignored unless create mode - edit and copy seed
   *  the type from the source transaction. */
  initialType?: TransactionType
  /** Validation toasts are this hook's submit gate: same checks, same
   *  messages, fired from submit(). Default true (the modal's behavior).
   *  Pass false when the host surfaces validation inline instead - the
   *  gates still run and submit still refuses, only the toasts go. */
  validationToasts?: boolean
  /** Lifted amount/date rows (the /new shared rows): explicit values win
   *  downward, internal writes report upward. Omitted (the modal) keeps
   *  the internal state authoritative. */
  shared?: TransactionFormShared
}

/** Controlled-override seam for a host that lifts the amount/date rows
 *  above the form (the /new shared rows). Internal state stays
 *  authoritative when no override is passed - the modal passes nothing.
 *  Explicit values win downward; internal writes (seeding) report upward
 *  synchronously, so the lifted value and internal state never diverge. */
export interface TransactionFormShared {
  amount: string
  onAmountChange: (value: string) => void
  date: string
  onDateChange: (value: string) => void
}

/** Field keys for display-only inline validation errors, derived 1:1 from
 *  the submit-gate toast validations: descriptionRequired, amountRequired,
 *  amountInvalid (amount and the optional originalAmount),
 *  adjustmentNeedsAccount, chooseCurrency. */
export type TransactionFormField = 'description' | 'amount' | 'originalAmount' | 'accountId' | 'currencyCode'

/** One translated message per failing field. Display-only - never a gate. */
export type TransactionFormErrors = Partial<Record<TransactionFormField, string>>

/** Value snapshot of the user-editable fields, taken at each seeding session
 *  boundary (and after resetForAnother) for the isDirty compare. */
interface SeedSnapshot {
  date: string
  description: string
  note: string
  type: TransactionType
  amount: string
  accountId: number | null
  currencyCode: string | null
  budgetId: number | null
  categoryId: number | null
  otherCurrency: boolean
  originalAmount: string
  originalCurrencyCode: string | null
  originalAccountId: number | null
  pendingFile: File | null
  /** Row value tuples, id excluded (seeded rows mint fresh uuids; identity
   *  is not an edit). */
  rows: Array<[string, string, string, string, number | null]>
}

/** Sentinel Select value for "no auto-adjustment" - the facet stays
 *  informational-only. Same trick as NO_ACCOUNT: the shared Select cannot
 *  hold a null-valued option, and 0 can never collide with a real id. */
export const NO_ADJUSTMENT = 0

/** TransactionItemInput[] (API payload shape) → Row[] (table editing shape).
 *  Parsed and prefilled sources carry no category, so every seeded row
 *  inherits the transaction's (categoryId null = inherit). */
const itemsToRows = (items: TransactionItemInput[]): Row[] =>
  items.map((i) => ({
    id: crypto.randomUUID(),
    name: i.name,
    quantity: i.quantity ?? '1',
    unit_price: i.unit_price ?? '',
    line_total: i.line_total ?? '',
    categoryId: null,
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

export function useTransactionForm({
  open,
  transaction = null,
  copyFrom = null,
  prefillReceipt = null,
  initialAccountId = null,
  initialType,
  validationToasts = true,
  shared,
}: UseTransactionFormOptions) {
  const { t } = useTranslation('transactions')
  const { t: tCommon } = useTranslation('common')
  const isEdit = !!transaction
  const queryClient = useQueryClient()
  const { workspace } = useWorkspace()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  const defaultBudgetId =
    budgets.length === 1 ? budgets[0].id : (budgets.find((b) => b.id === workspace?.default_budget_id)?.id ?? null)

  const [date, setDateState] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmountState] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [currencyCode, setCurrencyCode] = useState<string | null>(null)
  const [budgetId, setBudgetId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [otherCurrency, setOtherCurrency] = useState(false)
  const [originalAmount, setOriginalAmount] = useState('')
  const [originalCurrencyCode, setOriginalCurrencyCode] = useState<string | null>(null)
  // The facet's linked-adjustment account; null = the NO_ADJUSTMENT sentinel
  // (informational-only facet, no auto-adjustment booked).
  const [originalAccountId, setOriginalAccountId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<'items' | 'receipts' | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  // Rows are the editing source of truth in create mode (nameless rows, '' qty
  // mid-edit, etc. survive). Normalization to the API payload shape happens
  // once, at submit (rowsToItems, utils/transactionItems). Mirrors TransactionItemsEditor.
  const [pendingRows, setPendingRows] = useState<Row[]>([])
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  // Once-per-receipt latch (seenPrefill) for the prefill block in the
  // session render-adjust: a fresh parse mints a fresh object (BottomNav
  // builds a new literal per onSuccess), so a second From-receipt flow
  // still applies; the same reference re-observed never re-seeds. State,
  // not a ref: the seed runs during render and react-hooks/refs
  // (error-level) forbids ref writes there.
  const [seenPrefill, setSeenPrefill] = useState<{ file: File; parsed: ParsedReceipt } | null>(null)
  // Session tracker for the render-adjust below: the open flip or a
  // mid-open mode swap (footer Copy: transaction -> null, copyFrom -> t;
  // same object, so the mode discriminator is load-bearing) starts a new
  // seeding session. The sentinel initializer (closed, no mode, no source)
  // can never match a real session, so the first open always seeds. List
  // lengths and prefillReceipt are deliberately not session inputs: a
  // refetch that changes a length must never re-seed (it would clear typed
  // edits and remint the idempotency key mid-session), and a receipt
  // landing while open must stay ignored.
  const [session, setSession] = useState<{
    open: boolean
    mode: 'edit' | 'copy' | 'create' | 'none'
    source: Transaction | null
  }>({ open: false, mode: 'none', source: null })
  // Reference-list lengths the create-mode seeding last saw.
  const [seededLens, setSeededLens] = useState({ a: accounts.length, b: budgets.length, c: currencies.length })
  // Description autocomplete: keyboard highlight index into `suggestions`
  // (-1 = none) and the panel-open flag (follows focus/typing, closed on
  // Escape/Tab/select/blur). Reset in the open-effect and on type change.
  const [highlighted, setHighlighted] = useState(-1)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  // Optional note. The "More details" disclosure hosting it is presentation
  // (the fields component derives its open state from the values: open while
  // a note, item rows, a receipt, the other-currency facet or an adjustment
  // is set, unless the user closed it), so the hook carries only the value.
  const [note, setNote] = useState('')

  // ---- Additions over the moved modal code ----
  // Submit-attempt counter. Hosts key their inline-error display gate and
  // focus-first-invalid pass on it (every error shows after any submit
  // attempt) without owning validation - the gates live in submit().
  // Reset to 0 by the snapshot render-adjust at every seeding boundary
  // and resetForAnother bump, so the count is scoped to one session.
  const [submitCount, setSubmitCount] = useState(0)
  // Seed snapshot for isDirty. State, not a ref: isDirty reads it during
  // render, and render-time ref reads are forbidden. Written only by the
  // snapshot render-adjust below - one pass AFTER a seeding boundary, when
  // the committed values ARE the seeded values.
  const [seedSnapshot, setSeedSnapshot] = useState<SeedSnapshot | null>(null)
  // Latch naming the session/reset the snapshot was taken at.
  const [snapshottedFor, setSnapshottedFor] = useState<{ session: object; resetCount: number } | null>(null)
  const [resetCount, setResetCount] = useState(0)

  // Merged setters: internal writes report upward through the override so
  // the lifted value never goes stale (create seeding, reset). Without an
  // override they are plain passthroughs - modal behavior is unchanged.
  const setAmount = (value: string) => {
    setAmountState(value)
    shared?.onAmountChange(value)
  }
  const setDate = (value: string) => {
    setDateState(value)
    shared?.onDateChange(value)
  }
  // Downward half: the host's explicit value wins. Value-compare
  // render-adjust on this hook's own state - loop-safe by construction
  // (each write lands on a value that disproves the guard on the
  // immediate re-render) and StrictMode-idempotent.
  if (shared !== undefined && shared.amount !== amount) setAmount(shared.amount)
  if (shared !== undefined && shared.date !== date) setDate(shared.date)

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

  /** File-input onChange seam for the inline receipt parse. The HOST owns the
   *  hidden input element and the same-file-reselect clear (the input's DOM
   *  value reset), which is why this takes the File, not the change event. */
  const parseFile = (f: File | null) => {
    if (!f) return
    parse.mutate(f)
  }

  // Session-boundary external sync only - the render-adjust below owns all
  // STATE seeding, so this effect sets no state. Reset the inline parse
  // mutation (a closed mid-parse session must not leak isPending/error into
  // the next open). Deliberately not run on mere list-length changes:
  // killing an in-flight parse because accounts refetched was a latent bug,
  // not a feature. The host clears its file input's DOM value at the same
  // boundary, keyed on the same discriminators (the input element is
  // host-side).
  useEffect(() => {
    if (!open) return
    parse.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, copyFrom])

  // Session render-adjust: a session boundary (the open flip, or a mid-open
  // mode swap) seeds every field; React discards this render pass and
  // re-runs the component with the seeded state before anything commits.
  // Seeding runs during render, so this same pass must not consume the
  // values it just queued.
  const mode = transaction ? 'edit' : copyFrom ? 'copy' : 'create'
  const source = transaction ?? copyFrom ?? null
  const seeding = open !== session.open || session.mode !== mode || session.source !== source
  if (seeding) setSession({ open, mode, source })
  if (seeding && open) {
    // Clear any receipt-upload state from a previous session.
    setPendingFile(null)
    setPendingRows([])
    setDetailTab(null)
    // Suggestion panel starts closed for every fresh open.
    setHighlighted(-1)
    setSuggestionsOpen(false)
    // Copy mode prefills like edit, except the date: always today (D4).
    if (source) {
      setDate(transaction ? source.date : new Date().toISOString().slice(0, 10))
      setDescription(source.description)
      setNote(source.note ?? '')
      setType(source.type)
      setAmount(source.amount)
      setAccountId(source.account_id)
      setCurrencyCode(source.currency_code)
      setCategoryId(source.category_id)
      setOtherCurrency(!!source.original_currency_code)
      setOriginalAmount(source.original_amount ?? '')
      setOriginalCurrencyCode(source.original_currency_code)
      // Facet account round-trip. A stored null (informational-only facet,
      // including every row saved before facet accounts existed) stays null
      // in both modes - auto-picking here would book an adjustment on an
      // unrelated save. Edit echoes the stored id verbatim, like account_id:
      // the backend keeps an archived adjustment account. Copy is a create,
      // which rejects archived accounts, so an archived source account falls
      // back to the default-for-currency pick.
      setOriginalAccountId(
        transaction || source.original_account_id == null || accounts.some((a) => a.id === source.original_account_id)
          ? source.original_account_id
          : pickAccountForCurrency(accounts, source.original_currency_code),
      )
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
      // The caller's type seed wins (the page's ?type= link); the modal
      // passes nothing and keeps the expense default.
      setType(initialType ?? 'expense')
      setAmount('')
      // Starting account: the caller's initial account (the page's account
      // filter) when given, else the default account of the form's currency,
      // else No account (account-less entry stays a first-class path). The
      // initial account's currency seeds the form; an account-less start
      // seeds the primary currency.
      const seededCurrency =
        initialAccountId != null
          ? (accounts.find((a) => a.id === initialAccountId)?.currency_code ?? currencies[0]?.code ?? null)
          : (currencies[0]?.code ?? null)
      setCurrencyCode(seededCurrency)
      setAccountId(initialAccountId ?? pickAccountForCurrency(accounts, seededCurrency))
      setBudgetId(defaultBudgetId)
      setCategoryId(null)
      setOtherCurrency(false)
      setOriginalAmount('')
      setOriginalCurrencyCode(null)
      setOriginalAccountId(null)
      // Fresh key per open in create mode. Persists across mutation retries
      // within this open session — that's what makes a double-click or a
      // network-blip replay return the original 201 instead of a duplicate.
      setIdempotencyKey(crypto.randomUUID())

      // Receipt-first entry (BottomNav "From receipt"): seed from an
      // already-parsed receipt. Mirrors parse.onSuccess's seeding (above) but
      // runs at open time. Once-per-receipt: the parent sets prefillReceipt
      // BEFORE flipping open (BottomNav's parse.onSuccess does both in one
      // handler), so the open-flip seeding pass always sees the receipt, and
      // the seen-prefill state latch applies it at most once per receipt OBJECT.
      // prefillReceipt is deliberately not a session input: a receipt
      // landing while the modal is already open (a slow parse racing a manual
      // New-transaction open) is ignored, not applied - applying it would
      // re-seed over in-progress edits and regenerate the idempotency key
      // minted above. The dropped receipt stays recoverable via the inline
      // "Upload invoice/receipt" button below; do NOT remove that button.
      // Merchant fills description unconditionally here because the line
      // above just set it to '' (create-mode default is '').
      if (prefillReceipt && prefillReceipt !== seenPrefill) {
        setSeenPrefill(prefillReceipt)
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
        const currentAccountId = initialAccountId ?? pickAccountForCurrency(accounts, parsedEnabled?.code ?? currencies[0]?.code ?? null)
        const pick = pickAccountForCurrency(accounts, parsed.currency)
        if (
          pick !== null &&
          accounts.find((a) => a.id === currentAccountId)?.currency_code?.toUpperCase() !== parsed.currency?.toUpperCase()
        ) {
          setAccountId(pick)
        }
      }
    }
  }

  // Create-mode arrival adjust: apply the data-derived create defaults
  // (initial account / the currency's default account, primary currency,
  // default budget) when the reference lists' lengths change, only for
  // fields still at their seed values - never clears typed edits, never
  // remints the idempotency key.
  if (accounts.length !== seededLens.a || budgets.length !== seededLens.b || currencies.length !== seededLens.c) {
    setSeededLens({ a: accounts.length, b: budgets.length, c: currencies.length })
    if (open && !source) {
      // Only a length-CHANGING refetch re-runs this block (the seededLens
      // gate above): an equal-length refetch re-seeds nothing, so a
      // deliberate No-account pick survives it and is re-picked only by that
      // rare event - the pre-existing limitation, unchanged.
      if (accountId === null) {
        const currency = currencyCode ?? currencies[0]?.code ?? null
        const next = initialAccountId ?? pickAccountForCurrency(accounts, currency)
        setAccountId(next)
        const account = next != null ? accounts.find((a) => a.id === next) : undefined
        setCurrencyCode(account ? account.currency_code : currency)
      } else if (currencyCode == null) {
        // A cold mount with an explicit initial account seeds the account
        // before the accounts list arrives, so its currency could not be
        // derived at seed time and the locked currency select would sit on
        // its placeholder forever (submit then refuses on Choose currency).
        // Heal it here, once the list lands.
        const account = accounts.find((a) => a.id === accountId)
        if (account) setCurrencyCode(account.currency_code)
      }
      if (budgetId === null) setBudgetId(defaultBudgetId)
    }
  }

  /** Every user-editable form value as a flat snapshot. Row uuids excluded -
   *  only typed values make an edit. */
  const currentValues = (): SeedSnapshot => ({
    date,
    description,
    note,
    type,
    amount,
    accountId,
    currencyCode,
    budgetId,
    categoryId,
    otherCurrency,
    originalAmount,
    originalCurrencyCode,
    originalAccountId,
    pendingFile,
    rows: pendingRows.map((r) => [r.name, r.quantity, r.unit_price, r.line_total, r.categoryId ?? null]),
  })

  const sameSeedSnapshot = (a: SeedSnapshot, b: SeedSnapshot): boolean =>
    a.date === b.date &&
    a.description === b.description &&
    a.note === b.note &&
    a.type === b.type &&
    a.amount === b.amount &&
    a.accountId === b.accountId &&
    a.currencyCode === b.currencyCode &&
    a.budgetId === b.budgetId &&
    a.categoryId === b.categoryId &&
    a.otherCurrency === b.otherCurrency &&
    a.originalAmount === b.originalAmount &&
    a.originalCurrencyCode === b.originalCurrencyCode &&
    a.originalAccountId === b.originalAccountId &&
    a.pendingFile === b.pendingFile &&
    a.rows.length === b.rows.length &&
    a.rows.every((row, i) => row.every((v, j) => v === b.rows[i][j]))

  // Snapshot render-adjust: on the render pass AFTER a session boundary (or
  // a resetForAnother bump), the session state variable already holds the
  // new session and the committed field values are the seeded ones - record
  // them as the clean baseline. On the boundary pass itself `session` still
  // reads the old value, so this cannot fire against pre-seed values.
  // Loop-safe by construction: the latch lands on the values it compares.
  if (open && (snapshottedFor?.session !== session || snapshottedFor?.resetCount !== resetCount)) {
    setSnapshottedFor({ session, resetCount })
    setSeedSnapshot(currentValues())
    // The submit counter is per-session display state, not a lifetime
    // count: hosts gate show-all-errors on it, so a stale count from a
    // previous session would greet a fresh open with every error visible.
    // Zeroing here lands on the same discarded-and-rerun pass as the
    // baseline above, so the reopened form commits clean. Within a session
    // this adjust never fires, so a failed submit keeps its errors until
    // the user edits or the session changes.
    setSubmitCount(0)
  }

  // True when any user-editable value differs from the session-boundary
  // snapshot, receipt file and item rows included. Known conservative edge:
  // a mid-session arrival adjust that fills a still-null field counts as
  // dirty; hosts that need to exempt it can compare against validate() or
  // their own touched latches instead.
  const isDirty = open && seedSnapshot !== null && !sameSeedSnapshot(currentValues(), seedSnapshot)

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
    mutationFn: async (amounts: { amount: string; originalAmount: string }) => {
      const payload = {
        date,
        description: description.trim(),
        // Always sent, even as null: update is full-replace - an absent key
        // would silently clear a stored note.
        note: note.trim() || null,
        type,
        // Already-normalized drafts (handleSubmit): the fields keep what
        // the user typed, the wire gets dot-decimal.
        amount: amounts.amount,
        account_id: accountId,
        currency_code: currencyCode,
        category_id: type === 'adjustment' ? null : categoryId,
        original_amount: otherCurrency ? amounts.originalAmount : null,
        original_currency_code: otherCurrency ? originalCurrencyCode : null,
        // Always sent, even as null: update is full-replace - null means the
        // informational-only facet (and deletes any linked adjustment), a
        // real id auto-creates/updates the adjustment on that account.
        original_account_id: otherCurrency ? originalAccountId : null,
      }
      if (isEdit) {
        const trans = await transactionsApi.update(transaction.id, payload)
        // Edit mode never uploads an attachment here — uniform return shape so
        // onSuccess can destructure { uploadFailed } for both branches.
        return { trans, uploadFailed: false }
      }
      // Inline the items on the create call and send the idempotency key as
      // a header. This is the atomic
      // tx + items commit — once it returns, the data is durable.
      // Adjustments carry no items: the list is hidden for them, so rows parked
      // in state (a receipt parse before a type switch) must not ride along
      // invisibly on the payload. An empty list matches the schema's omitted
      // default exactly.
      const trans = await transactionsApi.create(
        { ...payload, items: type === 'adjustment' ? [] : rowsToItems(pendingRows) },
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
      // The transaction IS durable either way - invalidations run in both
      // cases. Only the message differs: a single error vs a single success.
      // Closing the host is the caller's job: submit() resolves once this
      // callback has run, and the host closes on ok (both upload branches
      // close, exactly like the inline close did).
      if (uploadFailed) {
        toast.error(t('form.uploadFailedPartial'))
      } else {
        toast.success(isEdit ? t('form.updated') : t('form.added'))
      }
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('form.saveFailed'))),
  })

  /** Field-keyed validation messages for inline display. Pure compute over
   *  the current values with no state writes - render-safe, so the derived
   *  errors below can call it on every render. Key precedence matches the
   *  gate order in submit. */
  const validate = (): TransactionFormErrors => {
    const errors: TransactionFormErrors = {}
    if (!description.trim()) errors.description = t('form.descriptionRequired')
    if (!amount) {
      errors.amount = t('form.amountRequired')
    } else if (normalizeAmountInput(amount) === null) {
      errors.amount = tCommon('validation.amountInvalid')
    }
    if (originalAmount !== '' && normalizeAmountInput(originalAmount) === null) {
      errors.originalAmount = tCommon('validation.amountInvalid')
    }
    if (type === 'adjustment' && !accountId) errors.accountId = t('form.adjustmentNeedsAccount')
    if (!currencyCode) errors.currencyCode = t('form.chooseCurrency')
    return errors
  }

  // Live field errors, re-derived every render from the same predicates the
  // submit gates use - the inline hints can never disagree with the gate.
  // Hosts gate DISPLAY (an error appears after its field's first invalid
  // blur, then tracks every keystroke, and all errors appear after a submit
  // attempt) on their own latches; the errors themselves never gate
  // anything.
  const errors = validate()

  /** Runs the validation gates and the save. The guards below are the
   *  modal's old handleSubmit checks, same order and same messages, and they
   *  remain the SUBMIT GATE - the field errors from validate() are
   *  display-only and never gate. Resolves after the mutation's
   *  invalidations and toasts have run; hosts await this and close on ok. */
  const submit = async (): Promise<{ ok: boolean; uploadFailed: boolean }> => {
    setSubmitCount((n) => n + 1)
    if (!description.trim()) {
      if (validationToasts) toast.error(t('form.descriptionRequired'))
      return { ok: false, uploadFailed: false }
    }
    if (!amount) {
      if (validationToasts) toast.error(t('form.amountRequired'))
      return { ok: false, uploadFailed: false }
    }
    const normAmount = normalizeAmountInput(amount)
    if (normAmount === null) {
      if (validationToasts) toast.error(tCommon('validation.amountInvalid'))
      return { ok: false, uploadFailed: false }
    }
    // The other-currency amount is optional: an empty field keeps today's
    // empty payload, a typed one must parse.
    const normOriginalAmount = originalAmount === '' ? '' : normalizeAmountInput(originalAmount)
    if (normOriginalAmount === null) {
      if (validationToasts) toast.error(tCommon('validation.amountInvalid'))
      return { ok: false, uploadFailed: false }
    }
    if (type === 'adjustment' && !accountId) {
      if (validationToasts) toast.error(t('form.adjustmentNeedsAccount'))
      return { ok: false, uploadFailed: false }
    }
    if (!currencyCode) {
      if (validationToasts) toast.error(t('form.chooseCurrency'))
      return { ok: false, uploadFailed: false }
    }
    try {
      const { uploadFailed } = await mutation.mutateAsync({ amount: normAmount, originalAmount: normOriginalAmount })
      return { ok: true, uploadFailed }
    } catch {
      // The API error toast already fired in onError above.
      return { ok: false, uploadFailed: false }
    }
  }

  /** Save-and-add-another: clear the per-transaction fields (description,
   *  amount, category, note, item rows, pending receipt), keep type,
   *  account, date, and the budget/currency picks, and remint the
   *  idempotency key so the next save cannot replay the previous one. The
   *  resetCount bump hands the snapshot adjust above a new baseline: the
   *  cleared form reads clean (not dirty) and the error map clears once the
   *  setters commit. */
  const resetForAnother = () => {
    setDescription('')
    setAmount('')
    setCategoryId(null)
    setNote('')
    setPendingRows([])
    setPendingFile(null)
    setIdempotencyKey(crypto.randomUUID())
    setResetCount((n) => n + 1)
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))
  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
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
  // Sentinel FIRST, then the accounts holding the facet currency (the only
  // legal adjustment targets). Plain names - every option shares one
  // currency, so a code suffix would be noise. Archived accounts are not
  // offered (an edited row's archived account shows the placeholder, like
  // the account select); an empty list leaves the sentinel alone.
  const adjustmentAccountOptions = [
    { value: NO_ADJUSTMENT, label: t('form.noAdjustment') },
    ...accounts
      .filter((a) => originalCurrencyCode != null && a.currency_code.toUpperCase() === originalCurrencyCode.toUpperCase())
      .map((a) => ({ value: a.id, label: a.name })),
  ]

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

  /** Switching the facet currency re-picks its account (per-currency default
      first, else the first by ordering, else none - informational-only): a
      previous pick cannot survive the switch, it holds the old currency. */
  const handleOriginalCurrencyChange = (code: string) => {
    setOriginalCurrencyCode(code)
    setOriginalAccountId(pickAccountForCurrency(accounts, code))
  }

  /** The sentinel maps back to null - the informational-only facet. */
  const handleAdjustmentAccountChange = (value: number) => {
    setOriginalAccountId(value === NO_ADJUSTMENT ? null : value)
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

  // Stable discriminator for the current seeding session: hosts key their
  // fields component on it so a session change remounts it - the remount is
  // the reset for that component's local state (disclosure latches, focus
  // one-shots, touched maps) and re-fires its per-open autoFocus.
  const sessionKey = `${session.open ? 'o' : 'c'}-${session.mode}-${session.source?.id ?? 'new'}`

  return {
    // Field values (budgets is exposed raw: hosts gate multi-budget UI on
    // its length, like the modal's budget/category row); mode discriminates
    // edit/copy/create for host UI gates
    mode,
    date, description, type, amount, accountId, currencyCode, budgetId, categoryId,
    otherCurrency, originalAmount, originalCurrencyCode, originalAccountId,
    note, pendingFile, pendingRows, budgets,
    // Combobox + detail-tab state (detailTab is modal-only UI state that the
    // session seeding resets; /new-style hosts ignore it)
    highlighted, suggestionsOpen, detailTab,
    // Setters
    setDate, setDescription, setType, setAmount, setCurrencyCode, setBudgetId,
    setCategoryId, setOtherCurrency, setOriginalAmount, setNote,
    setPendingRows, setPendingFile, setHighlighted, setSuggestionsOpen, setDetailTab,
    // Field-change handlers (sentinel mapping + currency re-pick logic)
    handleAccountChange, handleOriginalCurrencyChange, handleAdjustmentAccountChange,
    handleDescriptionKeyDown,
    // Derived option lists
    accountOptions, budgetOptions, categoryOptions, accountSelectOptions,
    currencyOptions, otherCurrencyOptions, adjustmentAccountOptions,
    // Autocomplete derivations
    suggestions, showSuggestions,
    // Receipt parse (the raw mutation object, for isPending/error state)
    parse, parseFile,
    // Submit path
    submit, isSaving: mutation.isPending,
    errors, validate,
    // Session lifecycle
    sessionKey, submitCount, isDirty, resetForAnother,
  }
}

/** The hook's full return value, for hosts that thread it into a
 *  presentational fields component as one prop. */
export type UseTransactionFormReturn = ReturnType<typeof useTransactionForm>
