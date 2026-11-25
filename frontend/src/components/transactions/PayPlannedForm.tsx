import { useTranslation } from 'react-i18next'
import type { PlannedTransaction } from '../../types'
import type { usePayPlannedForm } from '../../hooks/usePlannedPayment'
import { useButtonBlurGuard } from '../../hooks/useButtonBlurGuard'
import AmountField from './AmountField'
import DatePicker from '../DatePicker'
import { labelClass } from '../common/formStyles'
import { formatAmount, formatQuickPickDate } from '../../utils/format'

interface Props {
  form: ReturnType<typeof usePayPlannedForm>
  planned: PlannedTransaction
}

/** Body of the "Paid differently" form: what was planned, then the amount and
 *  date the payment books instead. Presentational: the state, the error
 *  timing and the save live in the form hook, and the buttons belong to the
 *  host (a page footer or a panel's action row). */
export default function PayPlannedForm({ form, planned }: Props) {
  const { t } = useTranslation('planned')
  // The Amount error stays hidden until the field's first invalid blur -
  // but a blur that the Mark as paid or Cancel button caused is the
  // button's own action, not that blur: an error row raised by it would
  // move the button under the pointer between the press and the release.
  const isButtonBlur = useButtonBlurGuard()
  // The currency is the plan's: a payment cannot change it, so the code
  // button shows it locked. The single option is what the button displays.
  const currencyOptions = [{ value: planned.currency_code, label: planned.currency_code }]
  return (
    <div className="space-y-4">
      {/* What was planned: the amount with its code always shown, and the
          planned date as a short label, never the raw ISO date. */}
      <p className="border border-border rounded-sm px-3 py-2 font-mono text-xs text-text-muted leading-relaxed">
        {t('pay.context', {
          amount: formatAmount(planned.amount, planned.currency_code),
          date: formatQuickPickDate(planned.planned_date, 'date'),
        })}
      </p>
      <AmountField
        id="pay-planned-amount"
        label={t('form.amountLabel')}
        required
        value={form.amount}
        onChange={form.setAmount}
        currency={{
          label: t('form.currencyLabel'),
          code: planned.currency_code,
          options: currencyOptions,
          // Locked: the plan's currency is the only choice.
          onChange: () => {},
          placeholder: t('form.selectCurrency'),
          locked: true,
          ariaLabel: t('form.currencyAria'),
        }}
        error={form.errors.amount}
        inputRef={form.amountRef}
        onBlur={(e) => {
          if (!isButtonBlur(e)) form.onAmountBlur()
        }}
      />
      <div>
        <label htmlFor="pay-planned-date" className={labelClass}>{t('form.dateLabel')}</label>
        <DatePicker id="pay-planned-date" value={form.date} onChange={form.setDate} />
      </div>
    </div>
  )
}
