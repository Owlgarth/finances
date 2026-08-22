import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '../common/Modal'
import { accountsApi, transactionsApi } from '../../api/client'
import type { Account } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import { formatAmount, subtractAmounts } from '../../utils/format'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  account: Account
}

/** "Set balance to X" — records an adjustment transaction for the computed delta. */
export default function SetBalanceModal({ open, onClose, account }: Props) {
  const queryClient = useQueryClient()
  // No autofocus on touch — don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const [target, setTarget] = useState('')

  const { data: balance } = useQuery({
    queryKey: ['account-balance', account.id],
    queryFn: () => accountsApi.balance(account.id),
    enabled: open,
  })

  // Money rule (utils/format.ts): never run backend Decimals through float
  // math — large balances get off-by-cent deltas recorded as real
  // transactions. Exact string math via subtractAmounts. The regex gates
  // e-notation ("1e5" is a valid number-input value that BigInt cannot
  // parse) and is also the "did they type an amount" check.
  const validTarget = /^-?(\d+(\.\d*)?|\.\d+)$/.test(target)
  const delta = balance && validTarget ? subtractAmounts(target, balance.balance) : null

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
      toast.success('Balance updated')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to adjust balance')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!balance) return toast.error('Current balance is still loading')
    if (!validTarget) return toast.error('Enter a target balance')
    if (delta === '0.00') return toast.error('Balance is already this amount')
    mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} className="p-6" title={`Set balance — ${account.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-text-muted">
          Current balance:{' '}
          <span className="font-mono text-text">
            {balance ? `${formatAmount(balance.balance)} ${account.currency_code}` : 'Loading…'}
          </span>
        </p>
        <div>
          <label htmlFor="target-balance" className={labelClass}>New balance</label>
          <input
            id="target-balance"
            type="number" inputMode="decimal"
            step="0.01"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={inputClass}
            autoFocus={!isTouch}
          />
        </div>
        {delta !== null && delta !== '0.00' && (
          <p className="text-sm text-text-muted">
            Adjustment: {' '}
            <span className={`font-mono ${delta.startsWith('-') ? 'text-negative' : 'text-positive'}`}>
              {delta.startsWith('-') ? '' : '+'}{formatAmount(delta)} {account.currency_code}
            </span>
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={mutation.isPending || !balance} className={primaryButtonClass}>
            {mutation.isPending ? 'Saving…' : 'Set balance'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
