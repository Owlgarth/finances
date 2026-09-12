import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import Modal from '../common/Modal'
import Select from '../common/Select'
import DatePicker from '../DatePicker'
import { transfersApi } from '../../api/client'
import type { Account, Transfer } from '../../types'
import { useAccounts } from '../../hooks/useDomain'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { getApiErrorMessage } from '../../utils/errors'
import { normalizeAmountInput, parseAmountNumber } from '../../utils/amountInput'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

const LAST_PAIR_KEY = 'owlgarth-last-transfer-pair'

interface Props {
  open: boolean
  onClose: () => void
  /** Prefill from a "Repeat" action on a history row (amounts/date cleared). */
  repeatFrom?: Transfer | null
  /** Edit an existing transfer: every field prefilled, saved via update. */
  editFrom?: Transfer | null
}

function accountById(accounts: Account[], id: number | null): Account | undefined {
  return accounts.find((a) => a.id === id)
}

/** Default from/to pair for a fresh create session: the last-used pair
 * (when both ends still exist), else auto-fill when exactly two accounts. */
function deriveDefaultPair(accounts: Account[]): { from: number | null; to: number | null } {
  let from: number | null = null
  let to: number | null = null
  const stored = localStorage.getItem(LAST_PAIR_KEY)
  if (stored) {
    const [f, t] = stored.split(',').map(Number)
    if (accounts.some((a) => a.id === f)) from = f
    if (accounts.some((a) => a.id === t)) to = t
  }
  if (from === null && to === null && accounts.length === 2) {
    from = accounts[0].id
    to = accounts[1].id
  }
  return { from, to }
}

export default function TransferModal({ open, onClose, repeatFrom, editFrom }: Props) {
  const { t } = useTranslation('transfers')
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()
  // No autofocus on touch - don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const { data: accounts = [] } = useAccounts(false)

  const [fromId, setFromId] = useState<number | null>(null)
  const [toId, setToId] = useState<number | null>(null)
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')

  // Session tracker for the render-adjust below: the open flip, or a
  // mid-open edit/repeat source swap, starts a new seeding session. The
  // sentinel initializer (closed, no mode, no source) can never match a
  // real session, so the first render of the mount-per-use edit modal
  // still counts as a boundary and seeds. accounts.length is deliberately
  // NOT a session input - a refetch that changes the list must never
  // re-seed typed edits. Late-arriving accounts get their own guarded
  // adjust below.
  const [session, setSession] = useState<{
    open: boolean
    mode: 'edit' | 'repeat' | 'create' | 'none'
    source: Transfer | null
  }>({ open: false, mode: 'none', source: null })
  // Length of the accounts list the default-branch pair seeding last saw.
  const [seededAccountsLen, setSeededAccountsLen] = useState(accounts.length)

  // Prefill render-adjust: edit > repeat > last-used pair > auto-fill when
  // exactly two accounts. A session boundary seeds every field; React
  // discards this render pass and re-runs the component with the seeded
  // state before anything commits. Seeding runs during render, so this
  // same pass must not consume the values it just queued.
  const mode = editFrom ? 'edit' : repeatFrom ? 'repeat' : 'create'
  const source = editFrom ?? repeatFrom ?? null
  const seeding = open !== session.open || session.mode !== mode || session.source !== source
  if (seeding) setSession({ open, mode, source })
  if (seeding && open) {
    if (editFrom) {
      setFromId(editFrom.from_account_id)
      setToId(editFrom.to_account_id)
      setFromAmount(editFrom.from_amount)
      setToAmount(editFrom.to_amount)
      setDate(editFrom.date)
      setDescription(editFrom.description)
    } else if (repeatFrom) {
      setFromId(repeatFrom.from_account_id)
      setToId(repeatFrom.to_account_id)
      setDescription(repeatFrom.description)
      setFromAmount('')
      setToAmount('')
      setDate(new Date().toISOString().slice(0, 10))
    } else {
      const pair = deriveDefaultPair(accounts)
      setFromId(pair.from)
      setToId(pair.to)
      setFromAmount('')
      setToAmount('')
      setDescription('')
      setDate(new Date().toISOString().slice(0, 10))
    }
  }

  // Default-branch arrival adjust: when the accounts list length changes
  // (first resolution, or a genuinely different list), re-derive the
  // last-used pair / two-account auto-fill - but only for a create-mode
  // session whose pair fields are still untouched, so a mid-edit refetch
  // never clobbers a typed transfer.
  if (accounts.length !== seededAccountsLen) {
    setSeededAccountsLen(accounts.length)
    if (open && !editFrom && !repeatFrom && fromId === null && toId === null) {
      const pair = deriveDefaultPair(accounts)
      setFromId(pair.from)
      setToId(pair.to)
    }
  }

  const fromAccount = accountById(accounts, fromId)
  const toAccount = accountById(accounts, toId)
  const crossCurrency = !!fromAccount && !!toAccount && fromAccount.currency_code !== toAccount.currency_code

  const fromNum = parseAmountNumber(fromAmount)
  const toNum = parseAmountNumber(toAmount)
  const impliedRate =
    crossCurrency && fromNum !== null && toNum !== null && fromNum > 0 ? (toNum / fromNum).toFixed(6) : null

  const mutation = useMutation({
    mutationFn: (amounts: { fromAmount: string; toAmount: string | null }) => {
      const payload = {
        from_account_id: fromId!,
        to_account_id: toId!,
        from_amount: amounts.fromAmount,
        to_amount: crossCurrency ? amounts.toAmount : null,
        date,
        description: description.trim(),
      }
      return editFrom ? transfersApi.update(editFrom.id, payload) : transfersApi.create(payload)
    },
    onSuccess: () => {
      // Only a newly recorded pair is "the last transfer made" - editing an
      // old one must not capture its pair as the next default.
      if (!editFrom) localStorage.setItem(LAST_PAIR_KEY, `${fromId},${toId}`)
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      toast.success(editFrom ? t('toast.updated') : t('toast.recorded'))
      onClose()
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, editFrom ? t('toast.updateFailed') : t('toast.recordFailed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromId || !toId) return toast.error(t('validation.chooseBoth'))
    if (fromId === toId) return toast.error(t('validation.accountsDiffer'))
    if (!fromAmount) return toast.error(t('validation.enterAmount'))
    const normFrom = normalizeAmountInput(fromAmount)
    if (normFrom === null) return toast.error(tCommon('validation.amountInvalid'))
    if (Number(normFrom) <= 0) return toast.error(t('validation.enterAmount'))
    // The received amount only exists on a cross-currency transfer; same
    // empty / unparseable / positive trio under its own message keys.
    let normTo: string | null = null
    if (crossCurrency) {
      if (!toAmount) return toast.error(t('validation.enterReceived'))
      normTo = normalizeAmountInput(toAmount)
      if (normTo === null) return toast.error(tCommon('validation.amountInvalid'))
      if (Number(normTo) <= 0) return toast.error(t('validation.enterReceived'))
    }
    mutation.mutate({ fromAmount: normFrom, toAmount: normTo })
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
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? t('formActions.saving') : editFrom ? t('formActions.save') : t('formActions.transfer')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
