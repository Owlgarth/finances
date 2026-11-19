import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
import Select from '../common/Select'
import Disclosure from '../common/Disclosure'
import type { UseTransferFormReturn } from '../../hooks/useTransferForm'
import { inputClass, labelClass } from '../common/formStyles'

interface Props {
  /** The transfer form hook's full return value (host-agnostic, like
   *  TransactionFormFields: the host owns the shared type/amount/date
   *  rows and the footer; this component renders the From/To pair and
   *  the More-details disclosure). */
  form: UseTransferFormReturn
  /** True after the host observed a failed submit: every field error
   *  shows (first-pick-then-keystroke otherwise). */
  showAllErrors?: boolean
  /** Bumped by the host after a failed submit whose first invalid field
   *  lives inside this component - focuses it. 0 = no request. */
  focusInvalidTick?: number
}

/** The /new transfer field layout: From and To selects side by side,
 *  then a More-details disclosure holding the description, the
 *  cross-currency received amount, and the implied-rate line. The date
 *  and the sent amount never render here - the page's shared rows own
 *  both. No autoFocus (the shared amount row owns initial focus). */
export default function TransferFormFields({ form, showAllErrors = false, focusInvalidTick = 0 }: Props) {
  const { t } = useTranslation('transfers')
  const { t: tTransactions } = useTranslation('transactions')
  // The disclosure label lives in the transactions namespace - the same
  // key the transaction form's More-details disclosure uses (one label
  // per concept, no transfers-namespace duplicate). Hoisted per the
  // aliased-t rule.
  const moreDetailsLabel = tTransactions('form.moreDetails')

  const [detailsUserOpen, setDetailsUserOpen] = useState(false)
  // Derived-until-touched: a cross-currency transfer puts a REQUIRED field
  // inside the disclosure, so it opens itself when one appears - unless
  // the user closed it on purpose.
  const [userClosedDetails, setUserClosedDetails] = useState(false)
  const [touched, setTouched] = useState({ from: false, to: false, toAmount: false })
  const showFrom = touched.from || showAllErrors
  const showTo = touched.to || showAllErrors
  const showToAmount = touched.toAmount || showAllErrors
  const detailsOpen =
    detailsUserOpen ||
    (form.crossCurrency && !userClosedDetails) ||
    (showAllErrors && !!form.errors.toAmount && !userClosedDetails)

  // Select exposes no ref; the focusable cell is a tabIndex={-1} wrapper
  // (one Tab reaches the trigger).
  const fromCellRef = useRef<HTMLDivElement | null>(null)
  const toCellRef = useRef<HTMLDivElement | null>(null)
  const toAmountRef = useRef<HTMLInputElement | null>(null)
  const lastFocusTick = useRef(0)

  // Focus the first invalid hosted field after a failed submit (the save
  // button lives in the page footer on /new; the modal host never bumps
  // the tick). One-shot ref latch - consumed, never re-fired for the same
  // tick. DOM-only effect.
  useEffect(() => {
    if (focusInvalidTick === lastFocusTick.current) return
    lastFocusTick.current = focusInvalidTick
    if (form.errors.from) fromCellRef.current?.focus()
    else if (form.errors.to) toCellRef.current?.focus()
    else if (form.errors.toAmount) toAmountRef.current?.focus()
  }, [focusInvalidTick, form.errors])

  const accountOptions = form.accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))
  const fromError = showFrom ? form.errors.from : undefined
  const toError = showTo ? form.errors.to : undefined
  const toAmountError = showToAmount ? form.errors.toAmount : undefined

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div
          ref={fromCellRef}
          tabIndex={-1}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <label className={labelClass}>{t('fields.from')}</label>
          <Select
            value={form.fromId}
            onChange={(v) => {
              form.setFromId(v)
              // A pick is the select-flavored "blurred": errors surface
              // from the first change on.
              setTouched((p) => ({ ...p, from: true }))
            }}
            options={accountOptions}
            placeholder={t('fields.fromAccount')}
            aria-label={t('fields.fromAccount')}
            error={fromError}
            className="w-full"
          />
        </div>
        <div
          ref={toCellRef}
          tabIndex={-1}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <label className={labelClass}>{t('fields.to')}</label>
          <Select
            value={form.toId}
            onChange={(v) => {
              form.setToId(v)
              // A pick is the select-flavored "blurred": errors surface
              // from the first change on.
              setTouched((p) => ({ ...p, to: true }))
            }}
            options={accountOptions}
            placeholder={t('fields.toAccount')}
            aria-label={t('fields.toAccount')}
            error={toError}
            className="w-full"
          />
        </div>
      </div>

      <Disclosure
        title={moreDetailsLabel}
        open={detailsOpen}
        onToggle={() => {
          if (detailsOpen) {
            setDetailsUserOpen(false)
            setUserClosedDetails(true)
          } else {
            setDetailsUserOpen(true)
            setUserClosedDetails(false)
          }
        }}
      >
        <div className="space-y-4 pt-1">
          <div>
            <label htmlFor="transfer-description" className={labelClass}>{t('fields.description')}</label>
            <input
              id="transfer-description"
              value={form.description}
              onChange={(e) => form.setDescription(e.target.value)}
              className={inputClass}
            />
          </div>
          {form.crossCurrency && (
            <div>
              <label htmlFor="transfer-to-amount" className={labelClass}>
                {t('fields.amountReceived', { code: form.toAccount?.currency_code ?? '' })}
              </label>
              {/* text (not number): comma-decimal typing must be received
                  as text and parsed at submit. */}
              <input
                ref={toAmountRef}
                id="transfer-to-amount"
                type="text"
                inputMode="decimal"
                value={form.toAmount}
                onChange={(e) => form.setToAmount(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, toAmount: true }))}
                className={inputClass}
              />
              {toAmountError && (
                <div role="alert" className="mt-1 flex items-center gap-1 text-[11px] text-negative font-medium">
                  <AlertCircle size={12} className="shrink-0" />
                  <span>{toAmountError}</span>
                </div>
              )}
            </div>
          )}
          {form.impliedRate && (
            <p className="text-xs text-text-muted font-mono">
              {t('impliedRate', { from: form.fromAccount?.currency_code ?? '', rate: form.impliedRate, to: form.toAccount?.currency_code ?? '' })}
            </p>
          )}
        </div>
      </Disclosure>
    </div>
  )
}
