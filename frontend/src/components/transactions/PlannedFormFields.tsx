import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
import Select from '../common/Select'
import DatePicker from '../DatePicker'
import AmountField from './AmountField'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { usePlannedFieldOptions, usePlannedForm } from '../../hooks/usePlannedForm'
import { useButtonBlurGuard } from '../../hooks/useButtonBlurGuard'
import { NO_ACCOUNT } from '../../utils/accountSelect'
import { inputClass, labelClass } from '../common/formStyles'

interface Props {
  /** The planned form hook's full return value. Host-agnostic: the host
      calls usePlannedForm and passes the result down - this component
      renders fields, owns no form state, and never imports Modal. The host
      keys it on form.sessionKey: the remount is the reset for the local
      error latches and re-fires the name input's per-session autoFocus. */
  form: ReturnType<typeof usePlannedForm>
}

/** Validatable fields in visual order (name, amount, then the amount's
 *  trailing currency button) - after a submit attempt the first invalid
 *  field in THIS order receives focus. */
const FIELD_ORDER = ['name', 'amount', 'currencyCode'] as const
type FieldKey = (typeof FIELD_ORDER)[number]

/** DOM ids for focus-first-invalid: natives and Select triggers alike -
 *  Select forwards no ref, but its id prop lands on the trigger button.
 *  The currency id is AmountField's `${id}-currency` derivation. */
const FIELD_IDS: Record<FieldKey, string> = {
  name: 'planned-name',
  amount: 'planned-amount',
  currencyCode: 'planned-amount-currency',
}

/** The planned create form's fields, one layout for every host: name,
 *  amount with its trailing currency button, date, then account and
 *  category side by side. Name and Amount are required and carry the
 *  required marker. Self-translating. */
export default function PlannedFormFields({ form }: Props) {
  const { t } = useTranslation('planned')
  const isTouch = useIsTouch()
  const { accountOptions, currencyOptions, categoryOptions } = usePlannedFieldOptions(form.stored)

  // Inline-error display gate: an error shows after its field's first blur,
  // then tracks every keystroke because form.errors re-derives every
  // render; any submit attempt shows every error. The currency is a
  // Select-only field - it has no blur, so only a submit attempt shows it.
  // A blur that a form button caused is not that first blur: pressing Add
  // or Cancel is the button's own action, and an error row raised by it
  // would move the button between the press and the release.
  const isButtonBlur = useButtonBlurGuard()
  const [touched, setTouched] = useState({ name: false, amount: false })
  const showAll = form.submitCount > 0
  const nameError = touched.name || showAll ? form.errors.name : undefined
  const amountError = touched.amount || showAll ? form.errors.amount : undefined
  const currencyError = showAll ? form.errors.currencyCode : undefined
  const nameInput = `${inputClass} ${nameError ? 'bg-negative-bg border-negative ring-1 ring-negative ' : ''}`

  // Focus the first invalid field after a submit attempt: focus-only effect
  // keyed on the submit counter. Errors are read as of the post-submit
  // render; re-running on their identity would refocus on every keystroke.
  useEffect(() => {
    if (form.submitCount === 0) return
    const firstInvalid = FIELD_ORDER.find((key) => !!form.errors[key])
    if (firstInvalid) document.getElementById(FIELD_IDS[firstInvalid])?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.submitCount])

  return (
    <div className="space-y-4">
      {/* No autofocus on touch - never yank the keyboard up over a fresh form. */}
      <div>
        <label htmlFor="planned-name" className={labelClass}>{t('form.nameLabel')} <span className="text-negative">*</span></label>
        <input
          id="planned-name"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          onBlur={(e) => {
            if (!isButtonBlur(e)) setTouched((prev) => ({ ...prev, name: true }))
          }}
          autoFocus={!isTouch}
          className={nameInput}
        />
        {nameError && (
          <div role="alert" className="mt-1 flex items-center gap-1 text-[11px] text-negative font-medium">
            <AlertCircle size={12} className="shrink-0" />
            <span>{nameError}</span>
          </div>
        )}
      </div>

      {/* Amount with the trailing currency code button; locked to the
          account's currency while an account is set. */}
      <AmountField
        id="planned-amount"
        label={t('form.amountLabel')}
        required
        value={form.amount}
        onChange={form.setAmount}
        currency={{
          label: t('form.currencyLabel'),
          code: form.currencyCode,
          options: currencyOptions,
          onChange: form.setCurrencyCode,
          placeholder: t('form.selectCurrency'),
          locked: form.accountId !== null,
          ariaLabel: t('form.currencyAria'),
          error: currencyError,
        }}
        error={amountError}
        onBlur={(e) => {
          if (!isButtonBlur(e)) setTouched((prev) => ({ ...prev, amount: true }))
        }}
      />

      <div>
        <label htmlFor="planned-date" className={labelClass}>{t('form.dateLabel')}</label>
        <DatePicker id="planned-date" value={form.plannedDate} onChange={form.setPlannedDate} />
      </div>

      {/* Account | Category, both optional. No cross-axis alignment on the
          pair: an end-aligned control drops below its sibling as soon as
          the sibling shows its error line. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="planned-account" className={labelClass}>{t('form.accountLabel')}</label>
          <Select
            id="planned-account"
            value={form.accountId ?? NO_ACCOUNT}
            onChange={form.handleAccountChange}
            options={accountOptions}
            placeholder={t('form.selectAccount')}
            aria-label={t('form.accountAria')}
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="planned-category" className={labelClass}>{t('form.categoryLabel')}</label>
          <Select
            id="planned-category"
            value={form.categoryId}
            onChange={form.setCategoryId}
            options={categoryOptions}
            placeholder={t('form.uncategorized')}
            aria-label={t('form.categoryAria')}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}
