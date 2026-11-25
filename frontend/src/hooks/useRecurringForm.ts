import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { recurringTransactionsApi, type RecurringInput } from '../api/client'
import type { PlannedTransaction, RecurringTransaction } from '../types'
import { useAccounts, useBudgets, useEnabledCurrencies, useWorkspaceCategories } from './useDomain'
import { getApiErrorMessage } from '../utils/errors'
import { normalizeAmountInput } from '../utils/amountInput'
import { NO_ACCOUNT, resolveAccountId } from '../utils/accountSelect'
import { recurrenceSummary, type RecurrenceSummary } from '../utils/recurrenceSummary'

// Wire enums never translate; labels resolve through t() in the hook
// (the STATUS_OPTIONS pattern in Planned.tsx). Static labelKeys so key:find
// sees every reference.
const INTERVAL_KIND_OPTIONS = [
  { value: 'daily', labelKey: 'recurring.form.intervalDaily' },
  { value: 'weekly', labelKey: 'recurring.form.intervalWeekly' },
  { value: 'monthly', labelKey: 'recurring.form.intervalMonthly' },
] as const

/** The three ways the recurring form opens: a new rule, an existing rule,
 *  or a new rule made from a planned row. */
export type RecurringFormMode = 'create' | 'edit' | 'from-planned'

/** Field-keyed validation errors, re-derived every render. Display-only:
 *  they never gate submit - the checks inside submit() are the gate,
 *  exactly like the form's original early-return toast chain. Key
 *  insertion order mirrors that chain (name, amount, currency, interval,
 *  plan ahead), which is also the order the fields are drawn in, so the
 *  first entry is the one the fields component focuses after a failed
 *  submit. */
export interface RecurringFormErrors {
  name?: string
  amount?: string
  currencyCode?: string
  intervalCount?: string
  upfrontCount?: string
}

interface Options {
  /** False while the host is still loading the seed a mode needs: nothing
   *  seeds until the form opens. */
  open: boolean
  mode: RecurringFormMode
  /** Edit mode: the rule being edited. */
  rule?: RecurringTransaction | null
  /** Make-recurring mode: the pending planned row the rule is created from. */
  fromPlanned?: PlannedTransaction | null
}

/** What submit() hands the mutation once its gates passed: the normalized
 *  amount and the two parsed counts. Everything else in the payload the
 *  mutation reads from the state it closes over. */
interface ValidatedValues {
  normAmount: string
  intervalCount: number
  upfrontCount: number
}

/**
 * Form state machine for creating, editing, or making a rule recurring
 * from a planned row, split from its original modal host so a page and a
 * side panel can host the same form. Owns the field state and its session
 * seeding render-adjust (the edit and from-planned prefills, the
 * single-account and primary-currency create defaults), the arrival
 * adjust for late reference data, validation, the save mutation (its
 * invalidations and toasts), and the schedule sentence's parts. The HOST
 * owns all DOM and closes after submit() resolves ok.
 */
export function useRecurringForm({ open, mode, rule = null, fromPlanned = null }: Options) {
  const { t } = useTranslation('planned')
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: currencies = [] } = useEnabledCurrencies()
  // Every category of the workspace: the form has no Budget row, so the
  // list is not narrowed to one budget. A category is labelled with its
  // budget's name only while the workspace has more than one budget.
  const { data: categories = [] } = useWorkspaceCategories(false)

  const isEdit = mode === 'edit' && rule != null

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [currencyCode, setCurrencyCode] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [intervalKind, setIntervalKind] = useState<RecurringTransaction['interval_kind']>('monthly')
  // Grammar numerics ride as text state (inputMode=numeric inputs); parsed
  // and validated at submit, exactly like the amount field.
  const [intervalCount, setIntervalCount] = useState('1')
  const [upfrontCount, setUpfrontCount] = useState('1')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  // '' = no end date (submits null).
  const [endDate, setEndDate] = useState('')
  // Materialize-all exists only while an end date is set: the Switch row
  // renders conditionally and both clear paths reset it, so true can never
  // submit without an end date (the backend 400s that combination).
  const [materializeAll, setMaterializeAll] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [adopt, setAdopt] = useState(false)

  // Session tracker for the render-adjust below: the open flip or a
  // mid-open mode swap starts a new seeding session. The sentinel
  // initializer (closed, no mode, no source) can never match a real
  // session, so the first open always seeds. List lengths are deliberately
  // not session inputs - no re-seed on refetch length changes;
  // late-arriving reference data gets its own guarded adjust below.
  const [session, setSession] = useState<{
    open: boolean
    mode: 'edit' | 'from-planned' | 'create' | 'none'
    source: RecurringTransaction | PlannedTransaction | null
  }>({ open: false, mode: 'none', source: null })
  // Reference-list lengths the create-mode seeding last saw.
  const [seededLens, setSeededLens] = useState({ a: accounts.length, c: currencies.length })
  // Seed snapshot for isDirty: captured on the kept render after every
  // seeding boundary (values then equal what the seeding pass wrote).
  // Any later difference from the snapshot is user work worth confirming
  // against. Declared here, above the adjusts, because the arrival adjust
  // below moves the baseline with the defaults it fills.
  const [seedSession, setSeedSession] = useState<typeof session | null>(null)
  const [seedSnapshot, setSeedSnapshot] = useState<{
    name: string
    amount: string
    accountId: number | null
    currencyCode: string | null
    categoryId: number | null
    intervalKind: RecurringTransaction['interval_kind']
    intervalCount: string
    startDate: string
    endDate: string
    upfrontCount: string
    materializeAll: boolean
    isActive: boolean
    adopt: boolean
  } | null>(null)
  // Submit-attempt counter. The fields component keys its show-every-error
  // gate and its focus-first-invalid pass on it without owning validation.
  // Reset to 0 beside every snapshot re-baseline, so the count is scoped to
  // one seeding session and a fresh open never greets with stale errors.
  const [submitCount, setSubmitCount] = useState(0)

  const source = rule ?? fromPlanned ?? null
  const seeding = open !== session.open || session.mode !== mode || session.source !== source
  if (seeding) setSession({ open, mode, source })
  if (seeding && open) {
    // Each mode seeds from its own row, so a stale seed of another mode
    // can never prefill the form.
    if (mode === 'edit' && rule) {
      setName(rule.name)
      setAmount(rule.amount)
      setAccountId(rule.account_id)
      setCurrencyCode(rule.currency_code)
      setCategoryId(rule.category_id)
      setIntervalKind(rule.interval_kind)
      setIntervalCount(String(rule.interval_count))
      setStartDate(rule.start_date)
      setUpfrontCount(String(rule.upfront_count))
      // The backend 400s materialize_all=true without an end date, so a
      // stored rule never carries the pair - the guard is defensive only.
      setMaterializeAll(rule.materialize_all && !!rule.end_date)
      setEndDate(rule.end_date ?? '')
      setIsActive(rule.is_active)
      setAdopt(false)
    } else if (mode === 'from-planned' && fromPlanned) {
      // "Make recurring": shared fields prefill from the planned row; its
      // date is the natural first occurrence (the adopt Switch links the
      // row itself when it stays on). Monthly is the common case - default.
      setName(fromPlanned.name)
      setAmount(fromPlanned.amount)
      setAccountId(fromPlanned.account_id)
      setCurrencyCode(fromPlanned.currency_code)
      setCategoryId(fromPlanned.category_id)
      setIntervalKind('monthly')
      setIntervalCount('1')
      setStartDate(fromPlanned.planned_date)
      setUpfrontCount('1')
      setMaterializeAll(false)
      setEndDate('')
      setIsActive(true)
      setAdopt(true)
    } else {
      setName('')
      setAmount('')
      setAccountId(accounts.length === 1 ? accounts[0].id : null)
      // Single account: prefill it and its currency. Otherwise the rule
      // starts account-less in the workspace's primary currency (the first
      // enabled one).
      setCurrencyCode(accounts.length === 1 ? accounts[0].currency_code : (currencies[0]?.code ?? null))
      setCategoryId(null)
      setIntervalKind('monthly')
      setIntervalCount('1')
      setStartDate(new Date().toISOString().slice(0, 10))
      setUpfrontCount('1')
      setMaterializeAll(false)
      setEndDate('')
      setIsActive(true)
      setAdopt(false)
    }
  }

  // Create-mode arrival adjust: apply the data-derived create defaults when
  // the reference lists' lengths change, only for fields still at their seed
  // values - a mid-edit refetch never clears typed values.
  // The clean baseline moves with the fill: a default the data applied is
  // not user work, so a cold open must not read as dirty once the lists
  // land.
  if (accounts.length !== seededLens.a || currencies.length !== seededLens.c) {
    setSeededLens({ a: accounts.length, c: currencies.length })
    if (open && !source) {
      if (accountId === null) {
        // Named once: the setters and the baseline read the same values.
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
  }

  // Snapshot render-adjust: on the pass after every seeding boundary the
  // session state already holds the new session and the committed field
  // values are the seeded ones - record them as the clean baseline, and
  // zero the submit counter in the same commit so a fresh session starts
  // with clean display state. Loop-safe: the latch lands on the value it
  // compares.
  if (open && seedSession !== session) {
    setSeedSession(session)
    setSeedSnapshot({
      name,
      amount,
      accountId,
      currencyCode,
      categoryId,
      intervalKind,
      intervalCount,
      startDate,
      endDate,
      upfrontCount,
      materializeAll,
      isActive,
      adopt,
    })
    setSubmitCount(0)
  }
  const isDirty =
    open &&
    seedSnapshot !== null &&
    (name !== seedSnapshot.name ||
      amount !== seedSnapshot.amount ||
      accountId !== seedSnapshot.accountId ||
      currencyCode !== seedSnapshot.currencyCode ||
      categoryId !== seedSnapshot.categoryId ||
      intervalKind !== seedSnapshot.intervalKind ||
      intervalCount !== seedSnapshot.intervalCount ||
      startDate !== seedSnapshot.startDate ||
      endDate !== seedSnapshot.endDate ||
      upfrontCount !== seedSnapshot.upfrontCount ||
      materializeAll !== seedSnapshot.materializeAll ||
      isActive !== seedSnapshot.isActive ||
      adopt !== seedSnapshot.adopt)

  const intervalKindOptions = INTERVAL_KIND_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))

  // Account, currency and category options: keep in sync with
  // usePlannedFieldOptions, the planned form's option helper (two consumers;
  // extract a shared helper at the third). The stored side is this form's
  // own: only the rule form edits a stored row whose account or category may
  // have been archived since.
  const multiBudget = budgets.length > 1
  // A category is labelled with its budget's name only while the workspace
  // has more than one budget.
  const categoryLabel = (name: string, budgetId: number) =>
    multiBudget ? `${name} (${budgets.find((b) => b.id === budgetId)?.name ?? ''})` : name
  // A rule being edited may name an account or a category that was archived
  // since, so the active lists no longer hold it. It stays in its list: a
  // Select shows its placeholder for a value that is not among its options,
  // which would read as an empty field while the stored id is still what the
  // form submits. Create and from-planned have no stored side.
  const storedRule = isEdit ? rule : null
  const storedAccount =
    storedRule && storedRule.account_id !== null && !accounts.some((a) => a.id === storedRule.account_id)
      ? { value: storedRule.account_id, label: `${storedRule.account_name ?? ''} (${storedRule.currency_code})` }
      : null
  const storedCategory = storedRule?.category ?? null
  const storedCategoryOption =
    storedRule && storedCategory !== null && storedRule.category_id !== null && !categories.some((c) => c.id === storedCategory.id)
      ? { value: storedRule.category_id, label: categoryLabel(storedCategory.name, storedCategory.budget_id) }
      : null
  const accountOptions = [
    { value: NO_ACCOUNT, label: t('noAccount') },
    ...(storedAccount ? [storedAccount] : []),
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` })),
  ]
  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))
  const categoryOptions = [
    ...(storedCategoryOption ? [storedCategoryOption] : []),
    ...categories.map((c) => ({ value: c.id, label: categoryLabel(c.name, c.budget_id) })),
  ]

  // Picking an account locks the rule's currency to the account's (the
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

  // The submit gates, in the original toast chain's order and with its
  // messages. Re-derived every render, so an error shown once tracks every
  // keystroke.
  const errors: RecurringFormErrors = {}
  if (!name.trim()) errors.name = t('form.nameRequired')
  if (!amount) errors.amount = t('form.amountRequired')
  else if (normalizeAmountInput(amount) === null) errors.amount = tCommon('validation.amountInvalid')
  // Only reachable before the currencies query lands on an account-less
  // create: a picked account sets the code, and edit/from-planned seeds it.
  if (!currencyCode) errors.currencyCode = t('form.currencyRequired')
  // Number() (not parseInt): '4.5' must fail isInteger instead of
  // truncating to 4; '' and garbage land at 0/NaN and fail the range.
  const intervalCountNum = Number(intervalCount)
  if (!Number.isInteger(intervalCountNum) || intervalCountNum < 1 || intervalCountNum > 365)
    errors.intervalCount = t('recurring.form.intervalCountInvalid')
  const upfrontCountNum = Number(upfrontCount)
  if (!Number.isInteger(upfrontCountNum) || upfrontCountNum < 1 || upfrontCountNum > 24)
    errors.upfrontCount = t('recurring.form.upfrontCountInvalid')
  const firstError = Object.values(errors)[0] ?? null

  // The schedule sentence's parts (pure derivation; the fields component
  // translates them).
  const summary: RecurrenceSummary = recurrenceSummary({ intervalKind, intervalCount, startDate, endDate })

  const mutation = useMutation({
    mutationFn: ({ normAmount, intervalCount, upfrontCount }: ValidatedValues) => {
      const input: RecurringInput = {
        name: name.trim(),
        amount: normAmount,
        account_id: accountId,
        currency_code: currencyCode,
        category_id: categoryId,
        interval_kind: intervalKind,
        interval_count: intervalCount,
        start_date: startDate,
        upfront_count: upfrontCount,
        // Always sent, never omitted (full-replace PUT); guaranteed false
        // whenever endDate is blank - the end-date clear paths reset it.
        materialize_all: materializeAll,
        // null when cleared, never omitted: the full-replace PUT resets an
        // absent key (RecurringInput doc contract).
        end_date: endDate || null,
        // Echo the Switch so a paused rule stays paused across edit; true in
        // create/from-planned (no control exposes it there).
        is_active: isActive,
        // Create-only adoption: the backend rejects adopt_planned_id on
        // update, and edit mode never sends it.
        ...(mode === 'from-planned' && adopt && fromPlanned ? { adopt_planned_id: fromPlanned.id } : {}),
      }
      return isEdit && rule ? recurringTransactionsApi.update(rule.id, input) : recurringTransactionsApi.create(input)
    },
    onSuccess: () => {
      // Adoption rewrites a planned row; both lists refetch.
      queryClient.invalidateQueries({ queryKey: ['recurring'] })
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(isEdit ? t('form.updated') : t('recurring.form.added'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('form.saveFailed'))),
  })

  /** Runs the validation gates and the save. Resolves after the mutation's
   *  invalidations and toasts have run; hosts await this and close on ok.
   *  ok is false when a gate failed (no request is sent) or the request
   *  failed (the mutation's onError already toasted). */
  const submit = async (): Promise<{ ok: boolean }> => {
    setSubmitCount((n) => n + 1)
    if (firstError !== null) return { ok: false }
    const normAmount = normalizeAmountInput(amount)
    // Unreachable while the derived errors above exist; kept as a typed
    // guard so the payload never sees an unparseable string.
    if (normAmount === null) return { ok: false }
    try {
      await mutation.mutateAsync({ normAmount, intervalCount: intervalCountNum, upfrontCount: upfrontCountNum })
      return { ok: true }
    } catch {
      // The mutation's onError already toasted the API failure; the host
      // only needs the result.
      return { ok: false }
    }
  }

  // Stable discriminator for the current seeding session: the fields
  // component re-arms its per-session display state when it changes.
  const sessionKey = `${session.open ? 'o' : 'c'}-${session.mode}-${session.source?.id ?? 'new'}`

  return {
    mode,
    name,
    setName,
    amount,
    setAmount,
    accountId,
    currencyCode,
    categoryId,
    intervalKind,
    setIntervalKind,
    intervalCount,
    setIntervalCount,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    upfrontCount,
    setUpfrontCount,
    materializeAll,
    setMaterializeAll,
    isActive,
    setIsActive,
    adopt,
    setAdopt,
    // Field-change handlers (sentinel mapping + currency re-pick logic)
    handleAccountChange,
    setCurrencyCode,
    setCategoryId,
    // Derived option lists
    accountOptions,
    currencyOptions,
    categoryOptions,
    intervalKindOptions,
    // Schedule sentence parts (pure; the fields component translates them)
    summary,
    // Submit path
    submit,
    isSaving: mutation.isPending,
    errors,
    // Session lifecycle
    isDirty,
    sessionKey,
    submitCount,
  }
}
