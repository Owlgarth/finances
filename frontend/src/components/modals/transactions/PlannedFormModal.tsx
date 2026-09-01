import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Ban, CheckCircle, Copy, Trash2 } from 'lucide-react'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../DatePicker'
import { budgetsApi, plannedTransactionsApi } from '../../../api/client'
import type { PlannedTransaction } from '../../../types'
import { useAccounts, useBudgets, useEnabledCurrencies } from '../../../hooks/useDomain'
import { useIsTouch } from '../../../hooks/useBreakpoint'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../../utils/errors'
import { normalizeAmountInput } from '../../../utils/amountInput'
import { destructiveButtonClass, inputClass, labelClass, positiveButtonClass, primaryButtonClass, secondaryButtonClass, warningButtonClass } from '../../common/formStyles'

// Sentinel for the deliberate account-less state. Select's value contract is
// string | number (it cannot hold null options), so the null account rides a
// numeric sentinel instead; account ids are positive, so 0 never collides.
const NO_ACCOUNT = 0

interface Props {
  open: boolean
  onClose: () => void
  planned?: PlannedTransaction | null
  /** Copy mode: prefill every field from this planned transaction except the
      date (today instead) and save as a NEW pending one. Ignored while editing. */
  copyFrom?: PlannedTransaction | null
  /** Edit mode only: renders a Delete button in the footer. Caller owns the
      confirm flow (and closing this modal). */
  onDelete?: (planned: PlannedTransaction) => void
  /** Edit mode only: renders a Copy button in the footer. Caller switches the
      modal into copy mode (planned=null, copyFrom=p). */
  onCopy?: (planned: PlannedTransaction) => void
  /** Edit mode only, pending rows: renders an Execute button in the footer.
      Caller closes this modal and runs the execute mutation. */
  onExecute?: (planned: PlannedTransaction) => void
  /** Edit mode only, pending rows: renders a "Cancel plan" button in the
      footer (status → cancelled — softer than delete, the row stays).
      Caller closes this modal and owns the confirm flow. */
  onCancelPlan?: (planned: PlannedTransaction) => void
}

export default function PlannedFormModal({ open, onClose, planned, copyFrom, onDelete, onCopy, onExecute, onCancelPlan }: Props) {
  const { t } = useTranslation('planned')
  const { t: tCommon } = useTranslation('common')
  const isEdit = !!planned
  const queryClient = useQueryClient()
  // No autofocus on touch — don't yank the keyboard up over a fresh modal.
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
  const [plannedDate, setPlannedDate] = useState(new Date().toISOString().slice(0, 10))
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // Copy mode prefills like edit, except the date: always today (D4).
    const source = planned ?? copyFrom
    if (source) {
      setName(source.name)
      setAmount(source.amount)
      setAccountId(source.account_id)
      setCurrencyCode(source.currency_code)
      setCategoryId(source.category_id)
      // Uncategorized source → fall back to the create-mode default budget so the
      // Category select is immediately usable (it is disabled while budgetId is
      // null, and the Budget select only renders for multi-budget workspaces).
      // Mirrors the create branch's setBudgetId(defaultBudgetId).
      setBudgetId(source.category?.budget_id ?? defaultBudgetId)
      setPlannedDate(planned ? source.planned_date : new Date().toISOString().slice(0, 10))
      // Edit bypasses the idempotency-key dedup — only create-mode submissions
      // carry a key. Copy mode IS a create, so it gets a fresh key (mirrors
      // TransactionFormModal).
      setIdempotencyKey(planned ? null : crypto.randomUUID())
    } else {
      setName('')
      setAmount('')
      setAccountId(accounts.length === 1 ? accounts[0].id : null)
      // Single account: prefill it and its currency. Otherwise the plan
      // starts account-less in the workspace's primary currency (the first
      // enabled one). Until the currencies query lands that is null and the
      // submit guard holds.
      setCurrencyCode(accounts.length === 1 ? accounts[0].currency_code : (currencies[0]?.code ?? null))
      setBudgetId(defaultBudgetId)
      setCategoryId(null)
      setPlannedDate(new Date().toISOString().slice(0, 10))
      // Fresh key per open in create mode. Persists across mutation retries
      // within this open session — a double-click or network-blip replay
      // returns the original 201 instead of a duplicate.
      setIdempotencyKey(crypto.randomUUID())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planned, copyFrom, accounts.length, budgets.length, currencies.length, defaultBudgetId])

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => budgetsApi.listCategories(budgetId!),
    enabled: open && !!budgetId,
  })

  const mutation = useMutation({
    mutationFn: (normAmount: string) => {
      const payload = { name: name.trim(), amount: normAmount, account_id: accountId, currency_code: currencyCode, category_id: categoryId, planned_date: plannedDate }
      // Echo the current status back on edit: the schema defaults a missing
      // status to 'pending', which the backend rejects as a revert for done rows.
      return isEdit
        ? plannedTransactionsApi.update(planned.id, { ...payload, status: planned.status })
        : plannedTransactionsApi.create(payload, { idempotencyKey: idempotencyKey ?? undefined })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(isEdit ? t('form.updated') : t('form.added'))
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
    // create: a picked account sets the code, and edit/copy seeds it.
    if (!currencyCode) return toast.error(t('form.currencyRequired'))
    mutation.mutate(normAmount)
  }

  // The sentinel option's label translates; the sentinel value itself is a
  // numeric constant that must never change (see NO_ACCOUNT above).
  const accountOptions = [
    { value: NO_ACCOUNT, label: t('noAccount') },
    ...accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` })),
  ]
  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))

  // Picking an account locks the plan's currency to the account's (the
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

  return (
    <Modal open={open} onClose={onClose} className="p-6" title={isEdit ? t('form.editTitle') : t('form.newTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="planned-name" className={labelClass}>{t('form.nameLabel')}</label>
          <input id="planned-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="planned-amount" className={labelClass}>{t('form.amountLabel')}</label>
            {/* text (not number): comma-decimal entry must reach the
                submit-time parser as typed (normalizeAmountInput). */}
            <input id="planned-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('form.dateLabel')}</label>
            <DatePicker value={plannedDate} onChange={setPlannedDate} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('form.accountLabel')}</label>
            <Select value={accountId ?? NO_ACCOUNT} onChange={handleAccountChange} options={accountOptions} placeholder={t('form.selectAccount')} aria-label={t('form.accountAria')} />
          </div>
          <div>
            <label className={labelClass}>{t('form.currencyLabel')}</label>
            <Select value={currencyCode} onChange={setCurrencyCode} options={currencyOptions} placeholder={t('form.selectCurrency')} aria-label={t('form.currencyAria')} mono disabled={accountId !== null} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {budgets.length > 1 && (
            <div>
              <label className={labelClass}>{t('form.budgetLabel')}</label>
              <Select value={budgetId} onChange={(v) => { setBudgetId(v); setCategoryId(null) }} options={budgets.map((b) => ({ value: b.id, label: b.name }))} placeholder={t('form.budgetPlaceholder')} aria-label={t('form.budgetAria')} />
            </div>
          )}
          <div className={budgets.length > 1 ? '' : 'col-span-2'}>
            <label className={labelClass}>{t('form.categoryLabel')}</label>
            <Select value={categoryId} onChange={setCategoryId} options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder={t('form.uncategorized')} aria-label={t('form.categoryAria')} disabled={!budgetId} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 pb-4">
          {/* Separate, individually clickable actions (never a menu). */}
          {isEdit && planned && (
            <div className="flex items-center gap-2">
              {onExecute && planned.status === 'pending' && (
                <button type="button" onClick={() => onExecute(planned)} className={positiveButtonClass}>
                  <CheckCircle size={13} className="inline mr-1" /> {t('form.execute')}
                </button>
              )}
              {onCopy && (
                <button type="button" onClick={() => onCopy(planned)} className={secondaryButtonClass}>
                  <Copy size={13} className="inline mr-1" /> {t('form.copy')}
                </button>
              )}
              {onCancelPlan && planned.status === 'pending' && (
                <button type="button" onClick={() => onCancelPlan(planned)} className={warningButtonClass}>
                  <Ban size={13} className="inline mr-1" /> {t('form.cancelPlan')}
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(planned)} className={destructiveButtonClass}>
                  <Trash2 size={13} className="inline mr-1" /> {t('form.delete')}
                </button>
              )}
            </div>
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
