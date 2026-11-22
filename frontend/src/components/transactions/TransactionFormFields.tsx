import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, CloudOff, Loader2, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SegmentedControl from '../common/SegmentedControl'
import Switch from '../common/Switch'
import Select from '../common/Select'
import Disclosure from '../common/Disclosure'
import DateQuickPick from '../common/DateQuickPick'
import AmountField from './AmountField'
import TransactionItemsList from './TransactionItemsList'
import { listboxPanelClass } from '../common/listboxParts'
import { controlHeightClass, inputClass, labelClass, secondaryButtonClass } from '../common/formStyles'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { useExtractionConfig } from '../../hooks/useDomain'
import { NO_ACCOUNT } from '../../utils/accountSelect'
import { NO_ADJUSTMENT, type UseTransactionFormReturn } from '../../hooks/useTransactionForm'
import { formatAmount } from '../../utils/format'

// File types the receipt parser accepts - keep in sync with the
// byte-identical copy in pages/NewTransactionPage.tsx (two consumers;
// extract a shared constant at the third).
const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

/** Sign prefix shown inside the amount input, keyed by type. A record
 *  lookup, not a JSX literal, keeps i18next/no-literal-string quiet.
 *  Decorative (aria-hidden): the segmented control carries the type. No
 *  prefix for adjustments - the delta carries its own sign. */
const SIGN_PREFIX: Partial<Record<'expense' | 'income', string>> = { expense: '-', income: '+' }

/** Visual order of the invalidatable fields (amount, currency, description,
 *  account, original amount) - after a submit attempt the first invalid
 *  field in THIS order receives focus, not the first in DOM order. */
const FIELD_ORDER = ['amount', 'currencyCode', 'description', 'accountId', 'originalAmount'] as const
type FieldKey = (typeof FIELD_ORDER)[number]

/** DOM ids for focus-first-invalid: natives and Select triggers alike -
 *  Select forwards no ref, but its id prop lands on the trigger button.
 *  The currency id is AmountField's `${id}-currency` derivation. */
const FIELD_IDS: Record<FieldKey, string> = {
  amount: 'tx-amount',
  currencyCode: 'tx-amount-currency',
  description: 'tx-desc',
  accountId: 'tx-account',
  originalAmount: 'tx-original-amount',
}

/** Focus order for the shared-fields variant: the host owns the amount
 *  row above this component, so the chain starts at the currency
 *  button. */
const SHARED_FIELD_ORDER = ['currencyCode', 'description', 'accountId', 'originalAmount'] as const

interface Props {
  /** The transaction form hook's full return value. Host-agnostic: the
   *  /new page and the transactions list's create panel both call
   *  useTransactionForm and pass the result down - the component renders
   *  fields, owns no form state, and never imports Modal. The host remounts
   *  it via a React key (keyed on form.sessionKey): the remount is the
   *  reset for this component's local state (the More-details userClosed
   *  latch, the note-focus one-shot ref, the touched map) and re-fires the
   *  amount input's per-open autoFocus. */
  form: UseTransactionFormReturn
  /** When true the host renders the type/amount/date rows above this
   *  component (the /new shared rows) and this component drops its own -
   *  the modal passes nothing and keeps its full layout. */
  sharedFields?: boolean
  /** True after the host observed a failed submit: every field error
   *  shows (first-blur-then-keystroke otherwise). Read only in the
   *  sharedFields variant - the modal keys the same timing on the hook's
   *  own submit counter. */
  showAllErrors?: boolean
  /** Bumped by the host after a failed submit whose first invalid field
   *  lives inside this component - focuses it. 0 = no request. */
  focusInvalidTick?: number
}

export default function TransactionFormFields({
  form,
  sharedFields = false,
  showAllErrors = false,
  focusInvalidTick = 0,
}: Props) {
  const { t } = useTranslation('transactions')
  const isTouch = useIsTouch()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()
  const descListId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const isEdit = form.mode === 'edit'
  const adjustmentOn = form.type === 'adjustment'

  // More-details open state, derived-until-touched: closed by default; open
  // while any inside value is set OR the user opened it, unless the user
  // closed it (a manual close stays closed even with values inside - they
  // stay in state, just hidden). Every control that SETS an inside value
  // lives inside the disclosure, so value-derived openness cannot fight the
  // user's latch; the sessionKey remount resets both arms between sessions.
  const [userOpened, setUserOpened] = useState(false)
  const [userClosed, setUserClosed] = useState(false)
  const hasInsideValues =
    form.note !== '' ||
    form.pendingRows.length > 0 ||
    form.pendingFile !== null ||
    form.otherCurrency ||
    adjustmentOn
  const moreOpen = (userOpened || hasInsideValues) && !userClosed

  // Note-focus machinery: a one-shot flag set in the Disclosure toggle and
  // consumed by the effect below - distinguishes a user-initiated expansion
  // (focus the note) from the derived pre-expanded path, which must leave
  // the amount field's autoFocus in charge. Focus-only effect, no setState.
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const openedByUserRef = useRef(false)
  useEffect(() => {
    if (!moreOpen || !openedByUserRef.current) return
    openedByUserRef.current = false
    if (!isTouch) noteRef.current?.focus()
  }, [moreOpen, isTouch])

  // Inline-error display gate: an error shows after its field's first
  // invalid USER blur (touched, via markTouched) or after any submit
  // attempt; once shown it tracks every keystroke because form.errors
  // re-derives every render. The modal path keys on the hook's submit
  // counter; a sharedFields host passes its own latch (it resets after a
  // successful save-and-add-another, which the counter cannot express).
  // The submit toasts remain the gate; these are display-only.
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})

  // Only USER-initiated blurs mark a field touched. On a pristine desktop
  // open the amount input's autoFocus focus is immediately stolen by the
  // modal panel's focus capture (useOverlay focuses the panel wrapper
  // right after mount - twice under dev StrictMode's double effect run),
  // and latching that programmatic blur would greet every fresh open with
  // "Amount is required". Arm the latch on the first real user input after
  // mount: focusing or leaving a field always takes a pointer or key
  // event, so every blur that can follow one is a user blur, while the
  // mount-time steals precede any input. One-way ref, no re-render; the
  // sessionKey remount re-arms it per open.
  const userInteractedRef = useRef(false)
  useEffect(() => {
    const mark = () => {
      userInteractedRef.current = true
    }
    document.addEventListener('pointerdown', mark, true)
    document.addEventListener('keydown', mark, true)
    return () => {
      document.removeEventListener('pointerdown', mark, true)
      document.removeEventListener('keydown', mark, true)
    }
  }, [])
  const markTouched = (key: FieldKey) => {
    if (!userInteractedRef.current) return
    setTouched((prev) => ({ ...prev, [key]: true }))
  }
  const showAll = sharedFields ? showAllErrors : form.submitCount > 0
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
  // expression containers, so the native fields resolve their error
  // rows in the body and the JSX embeds the result.
  const amountError = showError('amount')
  const currencyError = showError('currencyCode')
  const descriptionError = fieldError('description')
  const originalAmountError = fieldError('originalAmount')
  // The chosen suggestion's last amount as a muted text button. Fills the
  // amount ONLY on tap - never automatic. Byte-equivalent copy of the one
  // in pages/NewTransactionPage.tsx (two consumers; extract at the third).
  // Button idiom per AccountFormModal's manage-currencies link.
  const lastAmount = form.lastAmountHint
  const lastAmountHint =
    lastAmount !== null ? (
      <button
        type="button"
        onClick={() => form.setAmount(lastAmount)}
        className="mt-1 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus rounded-sm"
      >
        {t('form.lastAmountLabel')}{' '}
        <span className="font-mono font-medium tabular-nums">{formatAmount(lastAmount)}</span>
      </button>
    ) : undefined

  // Focus the first invalid field after a submit attempt: focus-only effect
  // keyed on the submit tick - the same sanctioned shape as Register's
  // failed-submit focus. A sharedFields host drives focus itself (the
  // amount row and the save button are page-owned), so this fires only in
  // the modal layout.
  useEffect(() => {
    if (sharedFields || form.submitCount === 0) return
    const firstInvalid = FIELD_ORDER.find((key) => !!form.errors[key])
    if (firstInvalid) document.getElementById(FIELD_IDS[firstInvalid])?.focus()
    // Errors are read as of the post-submit render; re-running on their
    // identity would refocus on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.submitCount])

  // Shared-fields host path: the page bumps the tick after a failed
  // submit whose first invalid field lives here. One-shot ref latch -
  // consumed, never re-fired for the same tick. DOM-only effect.
  const lastFocusTick = useRef(0)
  useEffect(() => {
    if (focusInvalidTick === lastFocusTick.current) return
    lastFocusTick.current = focusInvalidTick
    const firstInvalid = SHARED_FIELD_ORDER.find((key) => !!form.errors[key])
    if (firstInvalid) document.getElementById(FIELD_IDS[firstInvalid])?.focus()
  }, [focusInvalidTick, form.errors])

  // Balance-adjustment toggle: ON switches the type to adjustment (delta
  // label + required account); OFF restores the previous expense/income
  // type. An edited adjustment falls back to expense - its true previous
  // type is unknowable.
  const [previousType, setPreviousType] = useState<'expense' | 'income'>('expense')
  const handleAdjustmentToggle = (on: boolean) => {
    if (on) {
      if (!adjustmentOn) setPreviousType(form.type === 'adjustment' ? previousType : form.type)
      form.setType('adjustment')
    } else {
      form.setType(previousType)
    }
  }

  const handleFile = (f: File | null) => {
    if (!f) return
    form.parse.mutate(f)
    // Same-file reselect must re-fire onChange; the File object is already
    // captured by the parse mutation, so clearing the input value is safe.
    if (fileRef.current) fileRef.current.value = ''
  }

  const signPrefix = SIGN_PREFIX[form.type as 'expense' | 'income']
  // While adjustment is on, no segment may read selected: '' matches no
  // option, so every segment renders aria-checked={false} with tabIndex -1
  // (a radiogroup with no checked radio and no tab stop) and the control is
  // disabled - the switch row carries the state.
  const segmentValue = (adjustmentOn ? '' : form.type) as 'expense' | 'income'

  return (
    <>
      {/* Shared-fields hosts render the type/amount/date rows above this
              component; the modal layout renders them here. */}
      {!sharedFields && (
        <>
          {/* 1. Type: Expense / Income segmented control (Transfer arrives with
              the transfer flow). Income uses the positive tone. */}
          <div>
            <label className={labelClass}>{t('form.typeLabel')}</label>
            <SegmentedControl
              value={segmentValue}
              onChange={(v) => {
                form.setType(v)
                // Suggestions are per-type: the panel stays closed until the new
                // type's list arrives and the user interacts again.
                form.setHighlighted(-1)
                form.setSuggestionsOpen(false)
              }}
              disabled={adjustmentOn}
              aria-label={t('form.typeAria')}
              options={[
                { value: 'expense', label: t('type.expense') },
                { value: 'income', label: t('type.income'), tone: 'positive' },
              ]}
            />
          </div>

          {/* 2. Amount with sign prefix + currency code button (the shared
              AmountField row; its docblock carries the width-class rule). */}
          <AmountField
            id="tx-amount"
            label={adjustmentOn ? t('form.deltaAmountLabel') : t('form.amountLabel')}
            value={form.amount}
            onChange={form.setAmount}
            signPrefix={signPrefix}
            currency={{
              label: t('form.currencyLabel'),
              code: form.currencyCode,
              options: form.currencyOptions,
              onChange: form.setCurrencyCode,
              placeholder: t('form.currencyPlaceholder'),
              locked: form.accountId !== null,
              ariaLabel: t('form.currencyAria'),
              error: currencyError,
            }}
            error={amountError}
            hint={lastAmountHint}
            autoFocus={!isTouch}
            onBlur={() => markTouched('amount')}
          />

          {/* 3. Date: quick picks replace the DatePicker field. */}
          <div>
            <label className={labelClass}>{t('form.dateLabel')}</label>
            <DateQuickPick value={form.date} onChange={form.setDate} />
          </div>
        </>
      )}

      {/* 4. Description combobox (moved verbatim from the modal; state and
             keyboard handler are hook-side). */}
      <div>
        <label htmlFor="tx-desc" className={labelClass}>{t('form.descriptionLabel')}</label>
        <div className="relative">
          <input
            id="tx-desc"
            value={form.description}
            onChange={(e) => {
              form.setDescription(e.target.value)
              // Re-filtering moves the rows; a stale highlight could point
              // past the end of the shrunken list.
              form.setHighlighted(-1)
            }}
            onFocus={() => form.setSuggestionsOpen(true)}
            // Delayed close: clicking a suggestion row blurs the input first -
            // closing synchronously would unmount the row before the click lands.
            onBlur={() => {
              markTouched('description')
              setTimeout(() => form.setSuggestionsOpen(false), 150)
            }}
            onKeyDown={form.handleDescriptionKeyDown}
            className={`${inputClass} ${errorInput('description')}`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={form.showSuggestions}
            aria-controls={form.showSuggestions ? descListId : undefined}
            aria-activedescendant={form.highlighted >= 0 ? `${descListId}-opt-${form.highlighted}` : undefined}
          />
          {form.showSuggestions && (
            // max-w-full caps the fit-widest panel at the field's width.
            <div id={descListId} role="listbox" aria-label={t('form.frequentAria')} className={listboxPanelClass + ' max-w-full'}>
              {form.suggestions.map((s, i) => (
                <button
                  key={s.description}
                  id={`${descListId}-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === form.highlighted}
                  tabIndex={-1}
                  onClick={() => {
                    form.applySuggestion(s)
                  }}
                  className={
                    'w-full flex items-center px-2 text-left text-xs text-text transition-colors ' +
                    `${controlHeightClass} ` +
                    (i === form.highlighted ? 'bg-surface-hover ' : 'hover:bg-surface-hover ')
                  }
                >
                  <span className="truncate">{s.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {descriptionError}
      </div>

      {/* 5. Account + Category side by side. While adjustment is on: the
             Category half hides, Account spans the row and becomes required
             (the option list drops the No-account sentinel and submit
             validates; the * marks it). */}
      <div className="grid grid-cols-2 gap-3">
        <div className={adjustmentOn ? 'col-span-2' : ''}>
          <label htmlFor="tx-account" className={labelClass}>
            {t('form.accountLabel')} {adjustmentOn && <span className="text-negative">*</span>}
          </label>
          <Select
            id="tx-account"
            value={form.accountId ?? NO_ACCOUNT}
            onChange={(v) => {
              form.markPrefillTouched('account')
              form.handleAccountChange(v)
            }}
            options={form.accountSelectOptions}
            placeholder={t('form.selectAccount')}
            aria-label={t('form.accountAria')}
            error={showError('accountId')}
            className="w-full"
          />
        </div>
        {!adjustmentOn && (
          <div>
            <label className={labelClass}>{t('form.categoryLabel')}</label>
            <Select
              value={form.categoryId}
              onChange={(v) => {
                form.markPrefillTouched('category')
                form.setCategoryId(v)
              }}
              options={form.categoryOptions}
              placeholder={t('form.uncategorized')}
              aria-label={t('form.categoryAria')}
              disabled={!form.budgetId}
              className="w-full"
            />
          </div>
        )}
      </div>
      {/* Budget stays as an EXTRA row this phase (the new-transaction layout
             has no Budget field; the grouped picker is future work) -
             multi-budget workspaces keep budget selection. */}
      {!adjustmentOn && form.budgets.length > 1 && (
        <div>
          <label className={labelClass}>{t('form.budgetLabel')}</label>
          <Select
            value={form.budgetId}
            onChange={(v) => {
              form.setBudgetId(v)
              form.setCategoryId(null)
            }}
            options={form.budgetOptions}
            placeholder={t('form.budgetPlaceholder')}
            aria-label={t('form.budgetAria')}
            className="w-full"
          />
        </div>
      )}

      {/* 6. More details: everything optional behind one disclosure, closed
             by default, auto-open while a prefilled value lives inside. */}
      <Disclosure
        title={t('form.moreDetails')}
        open={moreOpen}
        onToggle={() => {
          if (moreOpen) {
            setUserOpened(false)
            setUserClosed(true)
          } else {
            setUserOpened(true)
            setUserClosed(false)
            openedByUserRef.current = true
          }
        }}
      >
        <div className="space-y-4 pt-1">
          {/* Note (textarea replaces the old swap-in note disclosure). */}
          <div>
            <label htmlFor="tx-note" className={labelClass}>{t('form.noteLabel')}</label>
            <textarea
              ref={noteRef}
              id="tx-note"
              rows={3}
              /* Mirrors the backend note max_length. */
              maxLength={2000}
              value={form.note}
              onChange={(e) => form.setNote(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Line items - create/copy mode only (edit has its own tab).
              Hidden for adjustments; rows stay in state, the payload gate is
              hook-side. */}
          {form.mode !== 'edit' && !adjustmentOn && (
            <TransactionItemsList
              rows={form.pendingRows}
              onChange={form.setPendingRows}
              amount={form.amount}
              currencyCode={form.currencyCode}
              categoryOptions={form.categoryOptions}
              transactionCategoryId={form.categoryId}
              remainderReadOnly
            />
          )}

          {/* Receipt: scan button + the pending-file row with its remove
              action. An offline scanner is shown-disabled (CloudOff). */}
          {!isEdit && extractionEnabled && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={form.parse.isPending || !extractionReachable}
                  title={extractionReachable ? undefined : t('form.scannerOfflineTitle')}
                  className={`${secondaryButtonClass} disabled:hover:bg-surface inline-flex items-center gap-1`}
                >
                  {form.parse.isPending ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> {t('form.reading')}
                    </>
                  ) : extractionReachable ? (
                    <>
                      <Upload size={13} /> {t('form.uploadReceipt')}
                    </>
                  ) : (
                    <>
                      <CloudOff size={13} /> {t('form.scanningOffline')}
                    </>
                  )}
                </button>
                {form.pendingFile && (
                  <span className="inline-flex min-w-0 items-center gap-1 text-xs text-text-muted">
                    <span className="truncate">{form.pendingFile.name}</span>
                    <button
                      type="button"
                      aria-label={t('form.removeFileAria')}
                      onClick={() => form.setPendingFile(null)}
                      className={
                        'inline-flex items-center justify-center p-1.5 text-text-muted hover:text-text ' +
                        'transition-colors max-sm:min-h-[44px] max-sm:min-w-[44px] ' +
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'
                      }
                    >
                      <X size={13} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Other-currency facet: fields verbatim from the modal, same gates
              (hidden for adjustments, hidden with no alternative currency). */}
          {!adjustmentOn && form.otherCurrencyOptions.length > 0 && (
            <div>
              <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                <input type="checkbox" checked={form.otherCurrency} onChange={(e) => form.setOtherCurrency(e.target.checked)} />
                {t('form.otherCurrency')}
              </label>
              {form.otherCurrency && (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <input
                    id="tx-original-amount"
                    type="text"
                    inputMode="decimal"
                    value={form.originalAmount}
                    onChange={(e) => form.setOriginalAmount(e.target.value)}
                    onBlur={() => markTouched('originalAmount')}
                    placeholder={t('form.originalAmountPlaceholder')}
                    className={`${inputClass} ${errorInput('originalAmount')}`}
                  />
                  <Select
                    value={form.originalCurrencyCode}
                    onChange={form.handleOriginalCurrencyChange}
                    options={form.otherCurrencyOptions}
                    placeholder={t('form.currencyPlaceholder')}
                    aria-label={t('form.originalCurrencyAria')}
                    mono
                    className="w-full"
                  />
                  {originalAmountError}
                  <div className="col-span-2">
                    <label className={labelClass}>{t('form.adjustmentAccountLabel')}</label>
                    <Select
                      value={form.originalAccountId ?? NO_ADJUSTMENT}
                      onChange={form.handleAdjustmentAccountChange}
                      options={form.adjustmentAccountOptions}
                      placeholder={t('form.selectAccount')}
                      aria-label={t('form.adjustmentAccountAria')}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Balance adjustment switch row (label-wrapped switch, text-xs
              label). While ON, the segmented control above is disabled -
              this row carries the state. */}
          <label className={`inline-flex items-center gap-3 cursor-pointer ${controlHeightClass}`}>
            <Switch
              checked={adjustmentOn}
              onChange={handleAdjustmentToggle}
              aria-label={t('form.balanceAdjustment')}
            />
            <span className="text-xs text-text">{t('form.balanceAdjustment')}</span>
          </label>
        </div>
      </Disclosure>
    </>
  )
}
