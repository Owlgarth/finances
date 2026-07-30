import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '../common/Modal'
import { accountsApi, transactionsApi } from '../../api/client'
import type { Account } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import { formatAmount } from '../../utils/format'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  account: Account
}

/** "Set balance to X" — records an adjustment transaction for the computed delta. */
export default function SetBalanceModal({ open, onClose, account }: Props) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState('')

  const { data: balance } = useQuery({
    queryKey: ['account-balance', account.id],
    queryFn: () => accountsApi.balance(account.id),
    enabled: open,
  })

  const current = balance ? parseFloat(balance.balance) : 0
  const targetNum = parseFloat(target || '0')
  const delta = target === '' ? null : targetNum - current

  const mutation = useMutation({
    mutationFn: () =>
      transactionsApi.create({
        date: new Date().toISOString().slice(0, 10),
        description: 'Balance adjustment',
        type: 'adjustment',
        amount: (delta as number).toFixed(2),
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
    if (delta === null) return toast.error('Enter a target balance')
    if (delta === 0) return toast.error('Balance is already this amount')
    mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Set balance — ${account.name}`} className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-text-muted">
          Current balance: <span className="font-mono text-text">{formatAmount(current)} {account.currency_code}</span>
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
            autoFocus
          />
        </div>
        {delta !== null && delta !== 0 && (
          <p className="text-sm text-text-muted">
            Adjustment: {' '}
            <span className={`font-mono ${delta > 0 ? 'text-positive' : 'text-negative'}`}>
              {delta > 0 ? '+' : ''}{formatAmount(delta)} {account.currency_code}
            </span>
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? 'Saving…' : 'Set balance'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
