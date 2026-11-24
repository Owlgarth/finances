import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { plannedTransactionsApi } from '../api/client'
import type { PlannedTransaction } from '../types'
import { useAccounts, useBudgets, useEnabledCurrencies, useWorkspaceCategories } from './useDomain'
import { getApiErrorMessage } from '../utils/errors'
import { normalizeAmountInput } from '../utils/amountInput'
import { NO_ACCOUNT, resolveAccountId } from '../utils/accountSelect'

/** Field-keyed validation errors. Display-only: they never gate submit -
 *  submit() runs the same checks and sends nothing while one stands. Key
 *  order mirrors the fields' visual order, so the first entry is also the
 *  first invalid field. */
export interface PlannedFormErrors {
  name?: string
  amount?: string
  currencyCode?: string
}

/** A Select option with a plain-text label. The string label keeps a list
 *  usable by the amount field's trailing currency button too, which takes
 *  string labels only. */
export interface PlannedFieldOption<T extends string | number> {
  value: T
  label: string
}

/** The stored values of a planned row that may be missing from the active lists
 *  (an account or a category archived since the row was saved). */
export type PlannedStoredValues = Pick<PlannedTransaction, 'account_id' | 'account_name' | 'category' | 'currency_code'>

/** How a planned item's account, currency and category choices are
 *  labelled - one source for the create form and the record's editors. */
export interface PlannedFieldOptions {
  /** The no-account sentinel first, then every active account - preceded by
   *  the stored account when no active account has its id. */
  accountOptions: PlannedFieldOption<number>[]
  /** Every enabled currency. */
  currencyOptions: PlannedFieldOption<string>[]
  /** Every active category of the workspace - preceded by the stored
   *  category when no active category has its id. */
  categoryOptions: PlannedFieldOption<number>[]
  /** True when the workspace has more than one active budget. */
  multiBudget: boolean
}

/** The option lists of a planned item's account, currency and category
 *  pickers. Without `stored` they are the active lists; with it, an account
 *  or a category the active lists no longer hold (archived since the row was
 *  saved) is added back under its stored name, so the picker keeps showing
 *  the row's own value instead of reading as an emptied field. A stored
 *  account is labelled like an active one, "Name (CODE)" by the row's
 *  currency code (the bare name with no code or no name), so a copied
 *  account's label does not change when the accounts list lands. The
 *  server still rejects a save that names an archived one, so the user
 *  has to pick another before the save goes through. */
export function usePlannedFieldOptions(stored?: PlannedStoredValues): PlannedFieldOptions {
  const { t } = useTranslation('planned')
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: categories = [] } = useWorkspaceCategories(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  // The budget suffix only earns its width when there is more than one
  // budget to tell the categories apart by. One label expression serves the
  // active categories and a stored one.
  const multiBudget = budgets.length > 1
  const budgetNameById = new Map(budgets.map((b) => [b.id, b.name]))
  const categoryLabel = (name: string, budgetId: number) => {
    const budgetName = budgetNameById.get(budgetId)
    return multiBudget && budgetName !== undefined ? `${name} (${budgetName})` : name
  }

  // The stored side. While a reference list is still loading, its stored
  // entry is present for every row; it leaves on its own when the list lands
  // holding that id, and a list never holds two entries for one id. A
  // stored account sits after the sentinel and ahead of the active accounts,
  // a stored category ahead of the active categories. A stored account
  // carries the row's currency code the way an active one carries its own,
  // so the two labels read alike; with an empty code or an empty name it is
  // the bare name.
  const storedAccountId = stored?.account_id ?? null
  const storedAccountName = stored?.account_name ?? null
  const storedCurrencyCode = stored?.currency_code ?? ''
  const storedCategory = stored?.category ?? null
  const storedAccount =
    storedAccountId !== null && storedAccountName !== null && !accounts.some((a) => a.id === storedAccountId)
      ? {
          value: storedAccountId,
          label: storedAccountName && storedCurrencyCode ? `${storedAccountName} (${storedCurrencyCode})` : storedAccountName,
        }
      : null
  const storedCategoryOption =
    storedCategory !== null && !categories.some((c) => c.id === storedCategory.id)
      ? { value: storedCategory.id, label: categoryLabel(storedCategory.name, storedCategory.budget_id) }
      : null

  return {
    // The sentinel option's label translates; the sentinel value itself is a
    // numeric constant that must never change (see NO_ACCOUNT).
    accountOptions: [
      { value: NO_ACCOUNT, label: t('noAccount') },
      ...(storedAccount ? [storedAccount] : []),
      ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` })),
    ],
    currencyOptions: currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` })),
    categoryOptions: [
      ...(storedCategoryOption ? [storedCategoryOption] : []),
      ...categories.map((c) => ({ value: c.id, label: categoryLabel(c.name, c.budget_id) })),
    ],
    multiBudget,
  }
}

interface Options {
  /** False until the host's seed has resolved: the session seeding below
   *  runs only while open, so a host passes false until its copy source has
   *  loaded and the form seeds exactly once with the final source. */
  open: boolean
  /** Copy mode: prefill every field from this planned transaction except
   *  the date (today instead) and save as a NEW pending one. */
  copyFrom?: PlannedTransaction | null
}

/** Every value a user can edit, as the isDirty baseline records it. */
interface SeedSnapshot {
  name: string
  amount: string
  accountId: number | null
  currencyCode: string | null
  categoryId: number | null
  plannedDate: string
}

/**
 * Form state machine for creating a planned transaction, plain or as a copy
 * of an existing one, split from its original host so a page and a panel
 * can host the same form inline. Owns the field state and its session
 * seeding render-adjust (copy prefill, the single-account and primary
 * currency create defaults), the idempotency key, validation and the create
 * mutation. The HOST owns all DOM, shows the field errors inline and leaves
 * after submit() resolves ok.
 */
export function usePlannedForm({ open, copyFrom = null }: Options) {
  const { t } = useTranslation('planned')
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  const { data: accounts = [] } = useAccounts(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [currencyCode, setCurrencyCode] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [plannedDate, setPlannedDate] = useState(new Date().toISOString().slice(0, 10))
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  // Session tracker for the render-adjust below: the open flip or a
  // mid-open source swap starts a new seeding session. The sentinel
  // initializer (closed, no mode, no source) can never match a real
  // session, so the first open always seeds. The source is identified by
  // id, not by object identity: a refetch of the detail entry (the poll
  // that waits for a paid item's transaction link) hands down a new object
  // for the same row, and that must not re-seed over typed edits. List
  // lengths are deliberately not session inputs - no re-seed on refetch
  // length changes; late-arriving reference data gets its own guarded
  // adjust below.
  const [session, setSession] = useState<{
    open: boolean
    mode: 'copy' | 'create' | 'none'
    sourceId: number | null
  }>({ open: false, mode: 'none', sourceId: null })
  // Reference-list lengths the create-mode seeding last saw.
  const [seededLens, setSeededLens] = useState({ a: accounts.length, c: currencies.length })
  // Submit-attempt counter, scoped to one session: hosts key their
  // show-every-error display and focus-first-invalid pass on it.
  const [submitCount, setSubmitCount] = useState(0)
  // Clean baseline for isDirty, captured on the render pass after a
  // seeding boundary (the committed values then are the seeded ones).
  const [seedSession, setSeedSession] = useState<typeof session | null>(null)
  const [seedSnapshot, setSeedSnapshot] = useState<SeedSnapshot | null>(null)

  const mode = copyFrom ? 'copy' : 'create'
  const sourceId = copyFrom?.id ?? null
  const seeding = open !== session.open || session.mode !== mode || session.sourceId !== sourceId
  if (seeding) setSession({ open, mode, sourceId })
  // Seeding runs during render: React discards this pass and re-runs with
  // the seeded state before anything commits.
  if (seeding && open) {
    if (copyFrom) {
      setName(copyFrom.name)
      setAmount(copyFrom.amount)
      setAccountId(copyFrom.account_id)
      setCurrencyCode(copyFrom.currency_code)
      setCategoryId(copyFrom.category_id)
      // A copy is a new item starting today, never the source's date.
      setPlannedDate(new Date().toISOString().slice(0, 10))
      // A copy IS a create, so it carries a key - a double-click or
      // network-blip replay returns the original 201 instead of a duplicate.
      setIdempotencyKey(crypto.randomUUID())
    } else {
      setName('')
      setAmount('')
      // Single account: prefill it and its currency. Otherwise the plan
      // starts account-less in the workspace's primary currency (the first
      // enabled one). Until the currencies query lands that is null and the
      // submit guard holds.
      setAccountId(accounts.length === 1 ? accounts[0].id : null)
      setCurrencyCode(accounts.length === 1 ? accounts[0].currency_code : (currencies[0]?.code ?? null))
      setCategoryId(null)
      setPlannedDate(new Date().toISOString().slice(0, 10))
      // Fresh key per session. Persists across submit retries within the
      // session - a double-click or network-blip replay returns the
      // original 201 instead of a duplicate.
      setIdempotencyKey(crypto.randomUUID())
    }
  }

  // Create-mode arrival adjust: apply the data-derived create defaults
  // (single-account prefill, primary currency) when the reference lists'
  // lengths change, only for fields still at their seed values - a mid-edit
  // refetch never clears typed values. The clean baseline moves with the
  // fill: a default the data applied is not user work, so a cold open must
  // not read as dirty once the lists land.
  if (accounts.length !== seededLens.a || currencies.length !== seededLens.c) {
    setSeededLens({ a: accounts.length, c: currencies.length })
    if (open && !copyFrom && accountId === null) {
      const nextId = accounts.length === 1 ? accounts[0].id : null
      const nextCode = accounts.length === 1 ? accounts[0].currency_code : (currencyCode ?? currencies[0]?.code ?? null)
      setAccountId(nextId)
      setCurrencyCode(nextCode)
      // The baseline follows only while both fields still sit at it: a
      // value the user chose stays user work.
      if (seedSnapshot !== null && accountId === seedSnapshot.accountId && currencyCode === seedSnapshot.currencyCode)
        setSeedSnapshot({ ...seedSnapshot, accountId: nextId, currencyCode: nextCode })
    }
  }

  // Snapshot render-adjust: on the pass after a seeding boundary the
  // session state already holds the new session and the committed values
  // are the seeded ones - record them as the clean baseline, and zero the
  // per-session submit counter in the same commit so a fresh session starts
  // with clean display state. Loop-safe: the latch lands on the value it
  // compares.
  if (open && seedSession !== session) {
    setSeedSession(session)
    setSeedSnapshot({ name, amount, accountId, currencyCode, categoryId, plannedDate })
    setSubmitCount(0)
  }

  const isDirty =
    seedSnapshot !== null &&
    (name !== seedSnapshot.name ||
      amount !== seedSnapshot.amount ||
      accountId !== seedSnapshot.accountId ||
      currencyCode !== seedSnapshot.currencyCode ||
      categoryId !== seedSnapshot.categoryId ||
      plannedDate !== seedSnapshot.plannedDate)

  const errors: PlannedFormErrors = {}
  if (!name.trim()) errors.name = t('form.nameRequired')
  if (!amount) errors.amount = t('form.amountRequired')
  else if (normalizeAmountInput(amount) === null) errors.amount = tCommon('validation.amountInvalid')
  // Only reachable before the currencies query lands on an account-less
  // create: a picked account sets the code, and a copy seeds it.
  if (!currencyCode) errors.currencyCode = t('form.currencyRequired')

  const mutation = useMutation({
    mutationFn: (normAmount: string) => {
      const payload = { name: name.trim(), amount: normAmount, account_id: accountId, currency_code: currencyCode, category_id: categoryId, planned_date: plannedDate }
      return plannedTransactionsApi.create(payload, { idempotencyKey: idempotencyKey ?? undefined })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(t('form.added'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('form.saveFailed'))),
  })

  /** Runs the validation checks and the save - the checks are the form's
   *  submit gate, in the field errors' order; the field-keyed errors above
   *  are display-only. Resolves after the mutation's invalidation and toast
   *  have run; hosts await this and leave on ok. */
  const submit = async (): Promise<{ ok: boolean }> => {
    setSubmitCount((n) => n + 1)
    const normAmount = normalizeAmountInput(amount)
    if (!name.trim() || !amount || normAmount === null || !currencyCode) return { ok: false }
    try {
      await mutation.mutateAsync(normAmount)
      return { ok: true }
    } catch {
      // The mutation's onError already toasted the API failure; the host
      // only needs the result.
      return { ok: false }
    }
  }

  // Picking an account locks the plan's currency to the account's (the
  // backend rejects a mismatch); picking "No account" keeps the current
  // currency - the typed amount is already in it.
  const handleAccountChange = (value: number) => {
    const id = resolveAccountId(value)
    setAccountId(id)
    if (id !== null) {
      const picked = accounts.find((a) => a.id === id)
      if (picked) setCurrencyCode(picked.currency_code)
    }
  }

  // Stable discriminator for the current seeding session: hosts key their
  // fields component on it, so a new session remounts the fields (local
  // error latches reset).
  const sessionKey = `${session.open ? 'o' : 'c'}-${session.mode}-${session.sourceId ?? 'new'}`

  return {
    name,
    setName,
    amount,
    setAmount,
    plannedDate,
    setPlannedDate,
    accountId,
    handleAccountChange,
    currencyCode,
    setCurrencyCode,
    categoryId,
    setCategoryId,
    errors,
    submit,
    submitCount,
    isSaving: mutation.isPending,
    isDirty,
    sessionKey,
    // The copy source's stored account, category and currency code, for the
    // option lists; a create has none.
    stored: copyFrom
      ? {
          account_id: copyFrom.account_id,
          account_name: copyFrom.account_name,
          category: copyFrom.category,
          currency_code: copyFrom.currency_code,
        }
      : { account_id: null, account_name: null, category: null, currency_code: '' },
  }
}
