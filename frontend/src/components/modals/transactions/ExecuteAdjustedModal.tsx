import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CheckCircle } from 'lucide-react'
import Modal from '../../common/Modal'
import DatePicker from '../../DatePicker'
import { plannedTransactionsApi, type PlannedExecuteInput } from '../../../api/client'
import type { PlannedTransaction } from '../../../types'
import { useIsTouch } from '../../../hooks/useBreakpoint'
import { getApiErrorMessage } from '../../../utils/errors'
import { normalizeAmountInput } from '../../../utils/amountInput'
import { formatAmount } from '../../../utils/format'
import { inputClass, labelClass, positiveButtonClass, secondaryButtonClass } from '../../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  /** The pending row being executed; the caller clears it in the same tick as open. */
  planned: PlannedTransaction | null
}

/** Execute with adjustments: date + amount prefilled from the plan, sent as
 * execute overrides (both keys always sent here; omitted keys would mean "as
 * planned" server-side). Self-contained like the sibling form modals - state,
 * validation, mutation, and toasts live here. */
export default function ExecuteAdjustedModal({ open, onClose, planned }: Props) {
  const { t } = useTranslation('planned')
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  // No autofocus on touch - don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  // Last seeded source. The page clears `planned` in the same tick as `open`,
  // while the mobile sheet stays mounted 80ms for its exit animation - a local
  // copy keeps the context line rendered through that close transition.
  const [source, setSource] = useState<PlannedTransaction | null>(null)

  const mutation = useMutation({
    // The normalized pair rides the mutate() argument (submit-seam pattern):
    // nothing at submit time derives from render state but this input.
    mutationFn: (input: { id: number } & PlannedExecuteInput) =>
      plannedTransactionsApi.execute(input.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success(t('executed'))
      onClose()
    },
    // Form-modal semantics: stay open so the values can be corrected.
    onError: (error) => toast.error(getApiErrorMessage(error, t('executeFailed'))),
  })

  // Session render-adjust (PlannedFormModal's minimal form - one mode, so no
  // mode discriminator). The open flip in the key is load-bearing: it re-seeds
  // even when the same row opens again. Each branch lands on a state that
  // disproves its own guard, so the adjust terminates by construction.
  const [session, setSession] = useState<{ open: boolean; source: PlannedTransaction | null }>({ open: false, source: null })
  const seeding = open !== session.open || session.source !== planned
  if (seeding) setSession({ open, source: planned })
  if (seeding && open && planned) {
    setSource(planned)
    // Wire string, shown RAW - normalization happens only at submit.
    setAmount(planned.amount)
    setDate(planned.planned_date)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!planned) return
    if (!amount) return toast.error(t('form.amountRequired'))
    const normAmount = normalizeAmountInput(amount)
    if (normAmount === null) return toast.error(tCommon('validation.amountInvalid'))
    mutation.mutate({ id: planned.id, payment_date: date, amount: normAmount })
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" className="p-6" title={t('executeAdjusted.title')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {source && (
          <p className="text-[10px] font-mono text-text-muted">
            {t('executeAdjusted.context', { values: `${source.planned_date} · ${formatAmount(source.amount)} ${source.currency_code}` })}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="execute-adjusted-amount" className={labelClass}>{t('form.amountLabel')}</label>
            {/* text (not number): comma-decimal entry must reach the submit-time
                parser as typed (normalizeAmountInput). */}
            <input id="execute-adjusted-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus={!isTouch} />
          </div>
          <div>
            <label htmlFor="execute-adjusted-date" className={labelClass}>{t('form.dateLabel')}</label>
            <DatePicker id="execute-adjusted-date" value={date} onChange={setDate} />
          </div>
        </div>
        <p className="text-[11px] text-text-muted leading-relaxed">{t('executeAdjusted.helper')}</p>
        <div className="flex justify-end gap-2 pt-2 pb-4">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('form.cancel')}</button>
          <button type="submit" disabled={mutation.isPending} className={positiveButtonClass}>
            <CheckCircle size={13} className="inline mr-1" /> {mutation.isPending ? t('executeAdjusted.submitting') : t('executeAdjusted.submit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
