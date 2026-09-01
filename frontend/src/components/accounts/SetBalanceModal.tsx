import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import Modal from '../common/Modal'
import { accountsApi, transactionsApi } from '../../api/client'
import type { Account } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import { normalizeAmountInput } from '../../utils/amountInput'
import { formatAmount, subtractAmounts } from '../../utils/format'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  account: Account
}

/** Sets the account balance to a target - records an adjustment transaction for the computed delta. */
export default function SetBalanceModal({ open, onClose, account }: Props) {
  const { t } = useTranslation('accounts')
  const queryClient = useQueryClient()
  // No autofocus on touch - don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const [target, setTarget] = useState('')

  const { data: balance } = useQuery({
    queryKey: ['account-balance', account.id],
    queryFn: () => accountsApi.balance(account.id),
    enabled: open,
  })

  // Money rule (utils/format.ts): never run backend Decimals through float
  // math - large balances get off-by-cent deltas recorded as real
  // transactions. Exact string math via subtractAmounts. The shared amount
  // parser (utils/amountInput.ts) gates what BigInt sees - it rejects
  // e-notation and unparseable separator mixes, accepting either decimal
  // separator per the active number style - and doubles as the "did they
  // type an amount" check.
  const normTarget = normalizeAmountInput(target)
  const delta = balance && normTarget !== null ? subtractAmounts(normTarget, balance.balance) : null

  const mutation = useMutation({
    mutationFn: () =>
      transactionsApi.create({
        date: new Date().toISOString().slice(0, 10),
        description: 'Balance adjustment',
        type: 'adjustment',
        amount: delta!,
        account_id: account.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-balance', account.id] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      toast.success(t('setBalance.updated'))
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('setBalance.adjustFailed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!balance) return toast.error(t('setBalance.stillLoading'))
    if (normTarget === null) return toast.error(t('setBalance.enterTarget'))
    if (delta === '0.00') return toast.error(t('setBalance.alreadyThisAmount'))
    mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} className="p-6" title={t('setBalance.title', { name: account.name })}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-text-muted">
          {t('setBalance.currentLabel')}{' '}
          <span className="font-mono text-text">
            {balance ? `${formatAmount(balance.balance)} ${account.currency_code}` : t('setBalance.loading')}
          </span>
        </p>
        <div>
          <label htmlFor="target-balance" className={labelClass}>{t('setBalance.newLabel')}</label>
          {/* text (not number): comma-decimal entry must reach the
              submit-time parser as typed (normalizeAmountInput). */}
          <input
            id="target-balance"
            type="text" inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={inputClass}
            autoFocus={!isTouch}
          />
        </div>
        {delta !== null && delta !== '0.00' && (
          <p className="text-sm text-text-muted">
            {t('setBalance.adjustmentLabel')} {' '}
            <span className={`font-mono ${delta.startsWith('-') ? 'text-negative' : 'text-positive'}`}>
              {delta.startsWith('-') ? '' : '+'}{formatAmount(delta)} {account.currency_code}
            </span>
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('formActions.cancel')}</button>
          <button type="submit" disabled={mutation.isPending || !balance} className={primaryButtonClass}>
            {mutation.isPending ? t('formActions.saving') : t('setBalance.submit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
