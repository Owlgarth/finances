import { useTranslation } from 'react-i18next'
import Modal from '../common/Modal'
import Select from '../common/Select'
import DatePicker from '../DatePicker'
import type { Transfer } from '../../types'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'
import { useTransferForm } from '../../hooks/useTransferForm'

interface Props {
  open: boolean
  onClose: () => void
  /** Prefill from a "Repeat" action on a history row (amounts/date cleared). */
  repeatFrom?: Transfer | null
  /** Edit an existing transfer: every field prefilled, saved via update. */
  editFrom?: Transfer | null
}

export default function TransferModal({ open, onClose, repeatFrom, editFrom }: Props) {
  const { t } = useTranslation('transfers')
  // No autofocus on touch - don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const {
    accounts, fromId, toId, fromAmount, toAmount, date, description,
    setFromId, setToId, setFromAmount, setToAmount, setDate, setDescription,
    crossCurrency, fromAccount, toAccount, impliedRate, submit, isSaving,
  } = useTransferForm({ open, editFrom, repeatFrom })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Toasts, invalidations and the last-pair write all ran inside the
    // hook; close only on a successful save, like onSuccess did.
    const result = await submit()
    if (result.ok) onClose()
  }

  const options = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))

  return (
    <Modal open={open} onClose={onClose} className="p-6" title={editFrom ? t('modal.titleEdit') : t('modal.titleDefault')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('fields.from')}</label>
            <Select value={fromId} onChange={setFromId} options={options} placeholder={t('fields.fromAccount')} aria-label={t('fields.fromAccount')} className="w-full" />
          </div>
          <div>
            <label className={labelClass}>{t('fields.to')}</label>
            <Select value={toId} onChange={setToId} options={options} placeholder={t('fields.toAccount')} aria-label={t('fields.toAccount')} className="w-full" />
          </div>
        </div>

        <div className={crossCurrency ? 'grid grid-cols-2 gap-3' : ''}>
          <div>
            <label htmlFor="from-amount" className={labelClass}>
              {crossCurrency ? t('fields.amountSent', { code: fromAccount?.currency_code ?? '' }) : t('fields.amount')}
            </label>
            {/* text (not number): browsers strip comma entry from number
                inputs before JS sees it, so comma-decimal typing must be
                received as text and parsed at submit (normalizeAmountInput). */}
            <input
              id="from-amount"
              type="text"
              inputMode="decimal"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className={inputClass}
              autoFocus={!isTouch}
            />
          </div>
          {crossCurrency && (
            <div>
              <label htmlFor="to-amount" className={labelClass}>{t('fields.amountReceived', { code: toAccount?.currency_code ?? '' })}</label>
              {/* Same as the sent-amount field: text so comma-decimal entry
                  reaches the submit-time parser intact. */}
              <input
                id="to-amount"
                type="text"
                inputMode="decimal"
                value={toAmount}
                onChange={(e) => setToAmount(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {impliedRate && (
          <p className="text-xs text-text-muted font-mono">
            {t('impliedRate', { from: fromAccount?.currency_code ?? '', rate: impliedRate, to: toAccount?.currency_code ?? '' })}
          </p>
        )}

        <div>
          <label className={labelClass}>{t('fields.date')}</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        <div>
          <label htmlFor="transfer-desc" className={labelClass}>{t('fields.description')}</label>
          <input id="transfer-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('formActions.cancel')}</button>
          <button type="submit" disabled={isSaving} className={primaryButtonClass}>
            {isSaving ? t('formActions.saving') : editFrom ? t('formActions.save') : t('formActions.transfer')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
