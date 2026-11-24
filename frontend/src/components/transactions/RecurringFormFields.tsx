import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, X } from 'lucide-react'
import Select from '../common/Select'
import Switch from '../common/Switch'
import InfoHint from '../common/InfoHint'
import Disclosure from '../common/Disclosure'
import DatePicker from '../DatePicker'
import AmountField from './AmountField'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { useRecurringForm } from '../../hooks/useRecurringForm'
import { NO_ACCOUNT } from '../../utils/accountSelect'
import { controlHeightClass, inputClass, labelClass } from '../common/formStyles'

/** Visual order of the error-capable fields (name, amount, the currency
 *  button beside it, the interval count, plan ahead) - after a submit
 *  attempt the first invalid field in THIS order receives focus. Plan
 *  ahead lives inside the More-details disclosure. */
const FIELD_ORDER = ['name', 'amount', 'currencyCode', 'intervalCount', 'upfrontCount'] as const
type FieldKey = (typeof FIELD_ORDER)[number]

/** DOM ids for focus-first-invalid: natives and Select triggers alike -
 *  Select forwards no ref, but its id prop lands on the trigger button.
 *  The currency id is AmountField's `${id}-currency` derivation. */
const FIELD_IDS: Record<FieldKey, string> = {
  name: 'recurring-name',
  amount: 'recurring-amount',
  currencyCode: 'recurring-amount-currency',
  intervalCount: 'recurring-interval-count',
  upfrontCount: 'recurring-upfront-count',
}

/** The End date's clear control: the shared control height, and a 44 px
 *  wide target on coarse pointers. */
const CLEAR_END_DATE_CLASS =
  `inline-flex items-center justify-center p-1 text-text-muted hover:text-text transition-colors ${controlHeightClass} ` +
  'pointer-coarse:min-w-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'

interface Props {
  /** The recurring form hook's full return value. Host-agnostic: the page
   *  and the side panel both call useRecurringForm and pass the result
   *  down - the component renders fields, owns no form state beyond its
   *  error-display and disclosure latches, and never imports Modal. The
   *  host owns the title, the actions and closing. */
  form: ReturnType<typeof useRecurringForm>
}

/** The recurring rule form's body: the schedule sentence, then the fields
 *  it restates, in one layout for the page and the panel. Self-contained
 *  with the hook's return value - the sentence strip, Name, Amount (the
 *  shared AmountField with the account-locked currency button), the
 *  Every / Interval pair, the Start date / End date pair, Account /
 *  Category, the mode's switch, and a More-details disclosure holding
 *  Plan ahead and Create all until end date. An error stays hidden until
 *  its field's first blur, then tracks every keystroke; a failed submit
 *  shows every error and focuses the first invalid field. */
export default function RecurringFormFields({ form }: Props) {
  const { t } = useTranslation('planned')
  // The disclosure label lives in the transactions namespace - the same
  // key the other forms' More-details disclosure uses (one label per
  // concept, no planned-namespace duplicate). Hoisted per the aliased-t
  // rule.
  const { t: tTx } = useTranslation('transactions')
  const isTouch = useIsTouch()
  const moreDetailsLabel = tTx('form.moreDetails')

  // Error-display gate: an error shows after its field's first blur
  // (touched) or after any submit attempt; once shown it tracks every
  // keystroke because form.errors re-derives every render. The latch is a
  // plain per-field blur flag - these hosts issue no focus steal, so a
  // blur is always a user blur. The currency button is a Select: it has no
  // blur latch and shows its error only after a failed submit.
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  // More-details open state, derived-until-touched: the user's open/close
  // latches (hasInsideValues below is the derived half).
  const [userOpened, setUserOpened] = useState(false)
  const [userClosed, setUserClosed] = useState(false)
  // The seeding session this component's latches were armed in.
  const [seenSession, setSeenSession] = useState(form.sessionKey)

  // After any submit attempt every error shows, and the first invalid
  // field in visual order receives focus.
  const showAll = form.submitCount > 0
  const firstInvalid = FIELD_ORDER.find((key) => !!form.errors[key])

  // Focus the first invalid field after a submit attempt: focus-only
  // effect keyed on the submit counter - the same sanctioned shape as the
  // other forms' failed-submit focus.
  useEffect(() => {
    if (form.submitCount === 0) return
    if (firstInvalid) document.getElementById(FIELD_IDS[firstInvalid])?.focus()
    // Errors are read as of the post-submit render; re-running on their
    // identity would refocus on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.submitCount])

  // Per-session display state: a re-target while this component stays
  // mounted (a side panel switching from one rule to another) starts a new
  // seeding session, so the blur latches and the disclosure latches re-arm
  // with it - a fresh session never paints a stale error. Guarded on the
  // session key, so the write disproves its own condition on the re-render.
  if (seenSession !== form.sessionKey) {
    setSeenSession(form.sessionKey)
    setTouched({})
    setUserOpened(false)
    setUserClosed(false)
  }
  // A failed submit whose first invalid field is inside the disclosure
  // opens it, and counts as the user opening it so the field stays in
  // reach while it is corrected. Decided during render, never in the focus
  // effect: the region must already be visible when focus runs, and a
  // display-none region cannot take focus. Loop-safe: the write disproves
  // the guard on the immediate re-render.
  if (showAll && firstInvalid === 'upfrontCount' && !userOpened) {
    setUserOpened(true)
    setUserClosed(false)
  }

  const markTouched = (key: FieldKey) => setTouched((prev) => ({ ...prev, [key]: true }))
  const showError = (key: FieldKey): string | undefined =>
    (touched[key] || showAll) && form.errors[key] ? form.errors[key] : undefined
  const errorInput = (key: FieldKey): string =>
    showError(key) ? 'bg-negative-bg border-negative ring-1 ring-negative ' : ''
  const fieldError = (key: FieldKey) => {
    const message = showError(key)
    if (!message) return null
    return (
      <div role="alert" className="mt-1 flex items-center gap-1 text-[11px] text-negative font-medium">
        <AlertCircle size={12} className="shrink-0" />
        <span>{message}</span>
      </div>
    )
  }
  // Hoisted: the rule flags literal arguments of calls inside JSX
  // expression containers, so the fields resolve their error rows in the
  // body and the JSX embeds the result.
  const nameError = fieldError('name')
  const amountError = showError('amount')
  const currencyError = showError('currencyCode')
  const intervalCountError = fieldError('intervalCount')
  const upfrontCountError = fieldError('upfrontCount')

  // The disclosure is open while an inside value is set or the user opened
  // it, unless the user closed it (a manual close stays closed even with
  // values inside - they stay in state, just hidden). The end date itself
  // lives outside the disclosure, so it does not count as an inside value.
  const hasInsideValues = form.upfrontCount !== '1' || form.materializeAll
  const moreOpen = (userOpened || hasInsideValues) && !userClosed

  // One i18next call: the count picks the plural form, so every language's
  // forms come from its catalog.
  const summary = form.summary
  const sentence = t(summary.key, { count: summary.count, day: summary.day, start: summary.start, end: summary.end })
  // Months shorter than the start day clamp to their last day.
  const clampDay = summary.day
  const monthlyClamp =
    form.intervalKind === 'monthly' && clampDay > 28 ? t('recurring.form.monthlyClamp', { day: clampDay }) : null

  // Clearing the end date drops create-all with it: true can never submit
  // without an end date (the backend 400s that combination).
  const clearEndDate = () => {
    form.setEndDate('')
    form.setMaterializeAll(false)
  }

  return (
    <div className="space-y-4">
      {/* 1. The schedule in plain words, restating the fields below. */}
      <div>
        <p className="border border-border rounded-sm px-3 py-2 font-mono text-xs text-text leading-relaxed">
          {sentence}
        </p>
        {monthlyClamp !== null && (
          <p className="mt-1 text-[11px] text-text-muted leading-relaxed">{monthlyClamp}</p>
        )}
      </div>

      {/* 2. Name. */}
      <div>
        <label htmlFor="recurring-name" className={labelClass}>{t('form.nameLabel')} <span className="text-negative">*</span></label>
        <input
          id="recurring-name"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          onBlur={() => markTouched('name')}
          autoFocus={!isTouch}
          className={`${inputClass} ${errorInput('name')}`}
        />
        {nameError}
      </div>

      {/* 3. Amount with the account-locked currency code button. */}
      <AmountField
        id="recurring-amount"
        label={t('form.amountLabel')}
        required
        value={form.amount}
        onChange={form.setAmount}
        currency={{
          label: t('form.currencyLabel'),
          code: form.currencyCode,
          options: form.currencyOptions,
          onChange: form.setCurrencyCode,
          placeholder: t('form.selectCurrency'),
          locked: form.accountId !== null,
          ariaLabel: t('form.currencyAria'),
          error: currencyError,
        }}
        error={amountError}
        onBlur={() => markTouched('amount')}
      />

      {/* 4. Every N | Interval unit. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="recurring-interval-count" className={labelClass}>{t('recurring.form.intervalCountLabel')} <span className="text-negative">*</span></label>
          <input
            id="recurring-interval-count"
            type="text"
            inputMode="numeric"
            value={form.intervalCount}
            onChange={(e) => form.setIntervalCount(e.target.value)}
            onBlur={() => markTouched('intervalCount')}
            className={`${inputClass} ${errorInput('intervalCount')}`}
          />
          {intervalCountError}
        </div>
        <div>
          <label className={labelClass}>{t('recurring.form.intervalKindLabel')}</label>
          <Select
            value={form.intervalKind}
            onChange={form.setIntervalKind}
            options={form.intervalKindOptions}
            aria-label={t('recurring.form.intervalKindAria')}
            className="w-full"
          />
        </div>
      </div>

      {/* 5. Start date | End date (optional, with its clear control). */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t('recurring.form.startDateLabel')}</label>
          <DatePicker value={form.startDate} onChange={form.setStartDate} />
        </div>
        <div>
          <label className={labelClass}>{t('recurring.form.endDateLabel')}</label>
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0">
              {/* Defensive '' reset: only the X button produces '' today;
                  any future DatePicker clear path must not leave
                  materialize_all=true without an end date. */}
              <DatePicker
                value={form.endDate}
                onChange={(v) => { form.setEndDate(v); if (v === '') form.setMaterializeAll(false) }}
                placeholder={t('recurring.form.endDatePlaceholder')}
                align="right"
              />
            </div>
            {/* DatePicker has no clear of its own; the X resets to the
                no-end-date state ('' submits null) and drops
                materialize-all with it. */}
            {form.endDate !== '' && (
              <button type="button" onClick={clearEndDate} aria-label={t('recurring.form.clearEndDate')} className={CLEAR_END_DATE_CLASS}>
                <X size={14} strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 6. Account | Category (every workspace category). */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t('form.accountLabel')}</label>
          <Select
            value={form.accountId ?? NO_ACCOUNT}
            onChange={form.handleAccountChange}
            options={form.accountOptions}
            placeholder={t('form.selectAccount')}
            aria-label={t('form.accountAria')}
            className="w-full"
          />
        </div>
        <div>
          <label className={labelClass}>{t('form.categoryLabel')}</label>
          <Select
            value={form.categoryId}
            onChange={form.setCategoryId}
            options={form.categoryOptions}
            placeholder={t('form.uncategorized')}
            aria-label={t('form.categoryAria')}
            className="w-full"
          />
        </div>
      </div>

      {/* 7. Active (edit only) and Adopt (make-recurring only) stay in the
          main body: adopt defaults to on and rewrites the planned row, so
          it must never be a hidden default, and Active is the rule's
          pause and resume control, so it stays one tap away. */}
      {form.mode === 'edit' && (
        <div className="flex items-center gap-2">
          <label className={`inline-flex items-center gap-3 text-xs text-text cursor-pointer ${controlHeightClass}`}>
            <Switch checked={form.isActive} onChange={form.setIsActive} aria-label={t('recurring.form.activeLabel')} />
            {t('recurring.form.activeLabel')}
          </label>
          <InfoHint ariaLabel={t('recurring.form.hintAria', { field: t('recurring.form.activeLabel') })} text={t('recurring.form.activeHint')} />
        </div>
      )}
      {form.mode === 'from-planned' && (
        <label className={`inline-flex items-center gap-3 text-xs text-text cursor-pointer ${controlHeightClass}`}>
          <Switch checked={form.adopt} onChange={form.setAdopt} aria-label={t('recurring.form.adoptLabel')} />
          {t('recurring.form.adoptLabel')}
        </label>
      )}

      {/* 8. More details: Plan ahead, and Create all until end date while
          an end date is set. */}
      <Disclosure
        title={moreDetailsLabel}
        open={moreOpen}
        onToggle={() => {
          if (moreOpen) {
            setUserOpened(false)
            setUserClosed(true)
          } else {
            setUserOpened(true)
            setUserClosed(false)
          }
        }}
      >
        <div className="space-y-4 pt-1">
          <div>
            <div className="flex items-center gap-1">
              <label htmlFor="recurring-upfront-count" className={labelClass}>{t('recurring.form.upfrontCountLabel')}</label>
              <InfoHint ariaLabel={t('recurring.form.hintAria', { field: t('recurring.form.upfrontCountLabel') })} text={t('recurring.form.upfrontCountHint')} />
            </div>
            <input
              id="recurring-upfront-count"
              type="text"
              inputMode="numeric"
              value={form.upfrontCount}
              onChange={(e) => form.setUpfrontCount(e.target.value)}
              onBlur={() => markTouched('upfrontCount')}
              disabled={form.materializeAll}
              className={`${inputClass} ${errorInput('upfrontCount')}`}
            />
            {upfrontCountError}
          </div>
          {form.endDate !== '' && (
            <div className="flex items-center gap-2">
              <label className={`inline-flex items-center gap-3 text-xs text-text cursor-pointer ${controlHeightClass}`}>
                <Switch checked={form.materializeAll} onChange={form.setMaterializeAll} aria-label={t('recurring.form.materializeAllLabel')} />
                {t('recurring.form.materializeAllLabel')}
              </label>
              <InfoHint ariaLabel={t('recurring.form.hintAria', { field: t('recurring.form.materializeAllLabel') })} text={t('recurring.form.materializeAllHint')} />
            </div>
          )}
        </div>
      </Disclosure>
    </div>
  )
}
