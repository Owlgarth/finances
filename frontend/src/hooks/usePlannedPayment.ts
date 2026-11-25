import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { plannedTransactionsApi, type PlannedExecuteInput } from '../api/client'
import type { PlannedTransaction } from '../types'
import { normalizeAmountInput } from '../utils/amountInput'
import { getApiErrorMessage } from '../utils/errors'

/** Cache refresh and success notice shared by both ways of paying a planned
 *  item. The payment creates a transaction, so the item, the transaction
 *  list and the balances all refetch. That transaction is linked by a
 *  background job, so the response usually carries no transaction yet: the
 *  toast names the transaction only when the response proves it exists. */
function usePaidEffects() {
  const { t } = useTranslation('planned')
  const queryClient = useQueryClient()
  const onPaid = (updated: PlannedTransaction) => {
    queryClient.invalidateQueries({ queryKey: ['planned'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['current-balances'] })
    queryClient.invalidateQueries({ queryKey: ['account-balance'] })
    toast.success(updated.transaction_id != null ? t('paidToast', { name: updated.name }) : t('markedPaidToast'))
  }
  const onPayFailed = (error: unknown) => toast.error(getApiErrorMessage(error, t('payFailed')))
  return { onPaid, onPayFailed }
}

/** The three status changes a host can offer on a planned item. Each call
 *  resolves to the updated item, or to null after the error toast, so a host
 *  never wraps them in its own try/catch and never sees a rejection. */
export function usePlannedPayment() {
  const { t } = useTranslation('planned')
  const queryClient = useQueryClient()
  const { onPaid, onPayFailed } = usePaidEffects()

  const markPaidMutation = useMutation({
    // No overrides: paying as planned (the planned date and amount) is the
    // server-side default, so no client-side date computation runs here.
    mutationFn: (p: PlannedTransaction) => plannedTransactionsApi.execute(p.id),
    onSuccess: onPaid,
    onError: onPayFailed,
  })

  // Skip and restore are full-replace updates: the server rewrites the whole
  // row from the payload, so every stored field is echoed and only the
  // status differs. The row stays in the list.
  const skipMutation = useMutation({
    mutationFn: (p: PlannedTransaction) =>
      plannedTransactionsApi.update(p.id, {
        name: p.name,
        amount: p.amount,
        account_id: p.account_id,
        currency_code: p.currency_code,
        category_id: p.category_id,
        planned_date: p.planned_date,
        status: 'cancelled',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(t('skippedToast'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('skipFailed'))),
  })

  const restoreMutation = useMutation({
    mutationFn: (p: PlannedTransaction) =>
      plannedTransactionsApi.update(p.id, {
        name: p.name,
        amount: p.amount,
        account_id: p.account_id,
        currency_code: p.currency_code,
        category_id: p.category_id,
        planned_date: p.planned_date,
        status: 'pending',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(t('restoredToast'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('restoreFailed'))),
  })

  // The mutation's own onError already toasted; the null only tells the
  // host that nothing changed.
  const settle = async (
    mutation: { mutateAsync: (p: PlannedTransaction) => Promise<PlannedTransaction> },
    p: PlannedTransaction,
  ): Promise<PlannedTransaction | null> => {
    try {
      return await mutation.mutateAsync(p)
    } catch {
      return null
    }
  }

  return {
    markPaid: (p: PlannedTransaction) => settle(markPaidMutation, p),
    skip: (p: PlannedTransaction) => settle(skipMutation, p),
    restore: (p: PlannedTransaction) => settle(restoreMutation, p),
    isPending: markPaidMutation.isPending || skipMutation.isPending || restoreMutation.isPending,
  }
}

/** State, validation and the save of the "Paid differently" form: the amount
 *  and date the payment books instead of the plan's own values. Seeded from
 *  the item, and again whenever a host re-targets a still-mounted form to
 *  another item. `submit` resolves true once the save succeeded (its cache
 *  invalidation is issued by then); a validation failure shows the errors
 *  and focuses the amount field instead of sending anything. */
export function usePayPlannedForm(planned: PlannedTransaction) {
  const { t } = useTranslation('planned')
  const { t: tCommon } = useTranslation('common')
  const { onPaid, onPayFailed } = usePaidEffects()
  const amountRef = useRef<HTMLInputElement>(null)

  const [seededId, setSeededId] = useState(planned.id)
  const [amount, setAmount] = useState(planned.amount)
  const [date, setDate] = useState(planned.planned_date)
  const [amountTouched, setAmountTouched] = useState(false)
  const [showAllErrors, setShowAllErrors] = useState(false)

  // Session render-adjust: a re-target re-seeds every field and the error
  // latches from the new item. Each write lands on state that disproves the
  // guard, so it terminates by construction.
  if (seededId !== planned.id) {
    setSeededId(planned.id)
    setAmount(planned.amount)
    setDate(planned.planned_date)
    setAmountTouched(false)
    setShowAllErrors(false)
  }

  // Raw validation on every render. The amount is shown exactly as the wire
  // string and normalized only at the submit seam; the date needs no rule:
  // the picker's input is read-only and always holds a whole calendar date.
  const normAmount = normalizeAmountInput(amount)
  let amountError: string | undefined
  if (!amount) amountError = t('form.amountRequired')
  else if (normAmount === null) amountError = tCommon('validation.amountInvalid')

  // Display timing: an error stays hidden until the field's first invalid
  // blur or a failed submit, then tracks every keystroke.
  const errors = { amount: amountTouched || showAllErrors ? amountError : undefined }

  const mutation = useMutation({
    // The normalized amount rides the mutate() argument: nothing at submit
    // time derives from render state but this input. Both keys are always
    // sent; an omitted key would mean "as planned" server-side.
    mutationFn: (input: PlannedExecuteInput) => plannedTransactionsApi.execute(planned.id, input),
    onSuccess: onPaid,
    onError: onPayFailed,
  })

  const submit = async (): Promise<boolean> => {
    if (amountError !== undefined || normAmount === null) {
      setShowAllErrors(true)
      amountRef.current?.focus()
      return false
    }
    try {
      await mutation.mutateAsync({ payment_date: date, amount: normAmount })
      return true
    } catch {
      // The mutation's onError already toasted.
      return false
    }
  }

  // Dirty means "differs from what the seeding wrote", which is exactly the
  // item's own values, so the compare needs no snapshot state.
  const isDirty = amount !== planned.amount || date !== planned.planned_date

  const onAmountBlur = () => {
    // Latches only on an invalid blur: a pristine field that merely loses
    // focus must not greet the user with an error.
    if (amountError !== undefined) setAmountTouched(true)
  }

  return {
    amount,
    setAmount,
    date,
    setDate,
    errors,
    submit,
    isSaving: mutation.isPending,
    isDirty,
    amountRef,
    onAmountBlur,
  }
}
