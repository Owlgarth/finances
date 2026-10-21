import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Trash2, X } from 'lucide-react'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import Switch from '../../common/Switch'
import DatePicker from '../../DatePicker'
import { budgetsApi, recurringTransactionsApi, type RecurringInput } from '../../../api/client'
import type { PlannedTransaction, RecurringTransaction } from '../../../types'
import { useAccounts, useBudgets, useEnabledCurrencies } from '../../../hooks/useDomain'
import { useIsTouch } from '../../../hooks/useBreakpoint'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../../utils/errors'
import { normalizeAmountInput } from '../../../utils/amountInput'
import { destructiveButtonClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

// Sentinel for the deliberate account-less state. Select's value contract is
// string | number (it cannot hold null options), so the null account rides a
// numeric sentinel instead; account ids are positive, so 0 never collides.
// Third copy of this recipe (PlannedFormModal, TransactionFormModal) - the
// next consumer extracts it into a shared module.
const NO_ACCOUNT = 0

// Wire enums never translate; labels resolve through t() in the component
// (the STATUS_OPTIONS pattern in Planned.tsx). Static labelKeys so key:find
// sees every reference.
const INTERVAL_KIND_OPTIONS = [
  { value: 'daily', labelKey: 'recurring.form.intervalDaily' },
  { value: 'weekly', labelKey: 'recurring.form.intervalWeekly' },
  { value: 'monthly', labelKey: 'recurring.form.intervalMonthly' },
] as const

// Day-of-month of an ISO yyyy-MM-dd string (0 when blank) - drives the
// monthly-clamp hint for start days that short months cannot carry.
const dayOfMonth = (iso: string): number => (iso.length >= 10 ? Number(iso.slice(8, 10)) : 0)

interface Props {
  open: boolean
  onClose: () => void
  /** Edit mode: the rule being edited (wins if fromPlanned is also set). */
  recurring?: RecurringTransaction | null
  /** Make-recurring mode: the pending planned row the rule is created from. */
  fromPlanned?: PlannedTransaction | null
  /** Edit mode only: renders a Delete button in the footer. Caller owns the
      confirm flow (and closing this modal). */
  onDelete?: (rule: RecurringTransaction) => void
}

export default function RecurringFormModal({ open, onClose, recurring, fromPlanned, onDelete }: Props) {
  const { t } = useTranslation('planned')
  const { t: tCommon } = useTranslation('common')
  const isEdit = !!recurring
  const queryClient = useQueryClient()
  // No autofocus on touch - don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const { workspace } = useWorkspace()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  const defaultBudgetId =
    budgets.length === 1 ? budgets[0].id : (budgets.find((b) => b.id === workspace?.default_budget_id)?.id ?? null)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [currencyCode, setCurrencyCode] = useState<string | null>(null)
  const [budgetId, setBudgetId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [intervalKind, setIntervalKind] = useState<RecurringTransaction['interval_kind']>('monthly')
  // Grammar numerics ride as text state (inputMode=numeric inputs); parsed
  // and validated at submit, exactly like the amount field.
  const [intervalCount, setIntervalCount] = useState('1')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [leadDays, setLeadDays] = useState('4')
  // '' = no end date (submits null).
  const [endDate, setEndDate] = useState('')
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
  const [seededLens, setSeededLens] = useState({ a: accounts.length, b: budgets.length, c: currencies.length })

  const mode = recurring ? 'edit' : fromPlanned ? 'from-planned' : 'create'
  const source = recurring ?? fromPlanned ?? null
  const seeding = open !== session.open || session.mode !== mode || session.source !== source
  if (seeding) setSession({ open, mode, source })
  if (seeding && open) {
    if (recurring) {
      setName(recurring.name)
      setAmount(recurring.amount)
      setAccountId(recurring.account_id)
      setCurrencyCode(recurring.currency_code)
      setCategoryId(recurring.category_id)
      // Uncategorized rule falls back to the create-mode default budget so
      // the Category select is immediately usable (it is disabled while
      // budgetId is null, and the Budget select only renders for
      // multi-budget workspaces).
      setBudgetId(recurring.category?.budget_id ?? defaultBudgetId)
      setIntervalKind(recurring.interval_kind)
      setIntervalCount(String(recurring.interval_count))
      setStartDate(recurring.start_date)
      setLeadDays(String(recurring.lead_days))
      setEndDate(recurring.end_date ?? '')
      setIsActive(recurring.is_active)
      setAdopt(false)
    } else if (fromPlanned) {
      // "Make recurring": shared fields prefill from the planned row; its
      // date is the natural first occurrence (the adopt Switch links the
      // row itself when it stays on). Monthly is the common case - default.
      setName(fromPlanned.name)
      setAmount(fromPlanned.amount)
      setAccountId(fromPlanned.account_id)
      setCurrencyCode(fromPlanned.currency_code)
      setCategoryId(fromPlanned.category_id)
      setBudgetId(fromPlanned.category?.budget_id ?? defaultBudgetId)
      setIntervalKind('monthly')
      setIntervalCount('1')
      setStartDate(fromPlanned.planned_date)
      setLeadDays('4')
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
      setBudgetId(defaultBudgetId)
      setCategoryId(null)
      setIntervalKind('monthly')
      setIntervalCount('1')
      setStartDate(new Date().toISOString().slice(0, 10))
      setLeadDays('4')
      setEndDate('')
      setIsActive(true)
      setAdopt(false)
    }
  }

  // Create-mode arrival adjust: apply the data-derived create defaults when
  // the reference lists' lengths change, only for fields still at their seed
  // values - a mid-edit refetch never clears typed values.
  if (accounts.length !== seededLens.a || budgets.length !== seededLens.b || currencies.length !== seededLens.c) {
    setSeededLens({ a: accounts.length, b: budgets.length, c: currencies.length })
    if (open && !source) {
      if (accountId === null) {
        setAccountId(accounts.length === 1 ? accounts[0].id : null)
        setCurrencyCode(accounts.length === 1 ? accounts[0].currency_code : (currencyCode ?? currencies[0]?.code ?? null))
      }
      if (budgetId === null) setBudgetId(defaultBudgetId)
    }
  }

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => budgetsApi.listCategories(budgetId!),
    enabled: open && !!budgetId,
  })

  const intervalKindOptions = INTERVAL_KIND_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))

  const accountOptions = [
    { value: NO_ACCOUNT, label: t('noAccount') },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` })),
  ]
  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))

  // Picking an account locks the rule's currency to the account's (the
  // backend rejects a mismatch); picking "No account" keeps the current
  // currency - the typed amount is already in it.
  const handleAccountChange = (value: number) => {
    const id = value === NO_ACCOUNT ? null : value
    setAccountId(id)
    if (id !== null) {
      const picked = accounts.find((a) => a.id === id)
      if (picked) setCurrencyCode(picked.currency_code)
    }
  }

  const mutation = useMutation({
    mutationFn: (input: RecurringInput) =>
      isEdit ? recurringTransactionsApi.update(recurring.id, input) : recurringTransactionsApi.create(input),
    onSuccess: () => {
      // Adoption rewrites a planned row; both lists refetch.
      queryClient.invalidateQueries({ queryKey: ['recurring'] })
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(isEdit ? t('form.updated') : t('recurring.form.added'))
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('form.saveFailed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error(t('form.nameRequired'))
    if (!amount) return toast.error(t('form.amountRequired'))
    const normAmount = normalizeAmountInput(amount)
    if (normAmount === null) return toast.error(tCommon('validation.amountInvalid'))
    // Only reachable before the currencies query lands on an account-less
    // create: a picked account sets the code, and edit/from-planned seeds it.
    if (!currencyCode) return toast.error(t('form.currencyRequired'))
    // Number() (not parseInt): '4.5' must fail isInteger instead of
    // truncating to 4; '' and garbage land at 0/NaN and fail the range.
    const intervalCountNum = Number(intervalCount)
    if (!Number.isInteger(intervalCountNum) || intervalCountNum < 1 || intervalCountNum > 365)
      return toast.error(t('recurring.form.intervalCountInvalid'))
    const leadDaysNum = Number(leadDays)
    if (!Number.isInteger(leadDaysNum) || leadDaysNum < 0 || leadDaysNum > 31)
      return toast.error(t('recurring.form.leadDaysInvalid'))
    mutation.mutate({
      name: name.trim(),
      amount: normAmount,
      account_id: accountId,
      currency_code: currencyCode,
      category_id: categoryId,
      interval_kind: intervalKind,
      interval_count: intervalCountNum,
      start_date: startDate,
      lead_days: leadDaysNum,
      // null when cleared, never omitted: the full-replace PUT resets an
      // absent key (RecurringInput doc contract).
      end_date: endDate || null,
      // Echo the Switch so a paused rule stays paused across edit; true in
      // create/from-planned (no control exposes it there).
      is_active: isActive,
      // Create-only adoption: the backend rejects adopt_planned_id on
      // update, and edit mode never sends it.
      ...(mode === 'from-planned' && adopt && fromPlanned ? { adopt_planned_id: fromPlanned.id } : {}),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="p-6"
      title={isEdit ? t('recurring.form.editTitle') : mode === 'from-planned' ? t('recurring.form.fromPlannedTitle') : t('recurring.form.newTitle')}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="recurring-name" className={labelClass}>{t('form.nameLabel')}</label>
          <input id="recurring-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="recurring-amount" className={labelClass}>{t('form.amountLabel')}</label>
            {/* text (not number): comma-decimal entry must reach the
                submit-time parser as typed (normalizeAmountInput). */}
            <input id="recurring-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('recurring.form.startDateLabel')}</label>
            <DatePicker value={startDate} onChange={setStartDate} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('form.accountLabel')}</label>
            <Select value={accountId ?? NO_ACCOUNT} onChange={handleAccountChange} options={accountOptions} placeholder={t('form.selectAccount')} aria-label={t('form.accountAria')} className="w-full" />
          </div>
          <div>
            <label className={labelClass}>{t('form.currencyLabel')}</label>
            <Select value={currencyCode} onChange={setCurrencyCode} options={currencyOptions} placeholder={t('form.selectCurrency')} aria-label={t('form.currencyAria')} mono disabled={accountId !== null} className="w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {budgets.length > 1 && (
            <div>
              <label className={labelClass}>{t('form.budgetLabel')}</label>
              <Select value={budgetId} onChange={(v) => { setBudgetId(v); setCategoryId(null) }} options={budgets.map((b) => ({ value: b.id, label: b.name }))} placeholder={t('form.budgetPlaceholder')} aria-label={t('form.budgetAria')} className="w-full" />
            </div>
          )}
          <div className={budgets.length > 1 ? '' : 'col-span-2'}>
            <label className={labelClass}>{t('form.categoryLabel')}</label>
            <Select value={categoryId} onChange={setCategoryId} options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder={t('form.uncategorized')} aria-label={t('form.categoryAria')} disabled={!budgetId} className="w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="recurring-interval-count" className={labelClass}>{t('recurring.form.intervalCountLabel')}</label>
            <input id="recurring-interval-count" type="text" inputMode="numeric" value={intervalCount} onChange={(e) => setIntervalCount(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('recurring.form.intervalKindLabel')}</label>
            <Select value={intervalKind} onChange={setIntervalKind} options={intervalKindOptions} aria-label={t('recurring.form.intervalKindAria')} className="w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="recurring-lead-days" className={labelClass}>{t('recurring.form.leadDaysLabel')}</label>
            <input id="recurring-lead-days" type="text" inputMode="numeric" value={leadDays} onChange={(e) => setLeadDays(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('recurring.form.endDateLabel')}</label>
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <DatePicker value={endDate} onChange={setEndDate} placeholder={t('recurring.form.endDatePlaceholder')} />
              </div>
              {/* DatePicker has no clear of its own; the X resets to the
                  no-end-date state ('' submits null). */}
              {endDate !== '' && (
                <button
                  type="button"
                  onClick={() => setEndDate('')}
                  aria-label={t('recurring.form.clearEndDate')}
                  className="p-1 text-text-muted hover:text-text transition-colors"
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        </div>
        {intervalKind === 'monthly' && dayOfMonth(startDate) > 28 && (
          <p className="text-[11px] text-text-muted">{t('recurring.form.monthlyClamp', { day: dayOfMonth(startDate) })}</p>
        )}
        {isEdit && (
          <label className="inline-flex items-center gap-3 text-xs text-text cursor-pointer">
            <Switch checked={isActive} onChange={setIsActive} aria-label={t('recurring.form.activeLabel')} />
            {t('recurring.form.activeLabel')}
          </label>
        )}
        {mode === 'from-planned' && (
          <label className="inline-flex items-center gap-3 text-xs text-text cursor-pointer">
            <Switch checked={adopt} onChange={setAdopt} aria-label={t('recurring.form.adoptLabel')} />
            {t('recurring.form.adoptLabel')}
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-2 pb-4">
          {isEdit && recurring && onDelete && (
            <button type="button" onClick={() => onDelete(recurring)} className={destructiveButtonClass}>
              <Trash2 size={13} className="inline mr-1" /> {t('form.delete')}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('form.cancel')}</button>
            <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>{mutation.isPending ? t('form.saving') : isEdit ? t('form.save') : t('form.add')}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
