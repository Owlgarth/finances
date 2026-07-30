import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '../common/Modal'
import Select from '../common/Select'
import { accountsApi } from '../../api/client'
import type { Account, AccountType } from '../../types'
import { useEnabledCurrencies } from '../../hooks/useDomain'
import { getApiErrorMessage } from '../../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  account?: Account | null
}

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]

export default function AccountFormModal({ open, onClose, account }: Props) {
  const isEdit = !!account
  const queryClient = useQueryClient()
  const { data: currencies = [] } = useEnabledCurrencies()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [currencyCode, setCurrencyCode] = useState<string | null>(account?.currency_code ?? null)
  const [openingBalance, setOpeningBalance] = useState(account?.opening_balance ?? '0')

  const mutation = useMutation({
    mutationFn: () => {
      if (isEdit) {
        return accountsApi.update(account.id, { name: name.trim(), type, opening_balance: openingBalance })
      }
      return accountsApi.create({
        name: name.trim(),
        type,
        currency_code: currencyCode!,
        opening_balance: openingBalance,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success(isEdit ? 'Account updated' : 'Account created')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to save account')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('Name is required')
    if (!isEdit && !currencyCode) return toast.error('Currency is required')
    mutation.mutate()
  }

  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit account' : 'New account'} className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="acc-name" className={labelClass}>Name</label>
          <input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
        </div>

        <div>
          <label className={labelClass}>Type</label>
          <Select value={type} onChange={(v) => setType(v)} options={TYPE_OPTIONS} aria-label="Account type" />
        </div>

        {!isEdit && (
          <div>
            <label className={labelClass}>Currency</label>
            <Select
              value={currencyCode}
              onChange={(v) => setCurrencyCode(v)}
              options={currencyOptions}
              placeholder="Select currency"
              aria-label="Account currency"
              mono
              searchable
            />
          </div>
        )}

        <div>
          <label htmlFor="acc-opening" className={labelClass}>Opening balance</label>
          <input
            id="acc-opening"
            type="number" inputMode="decimal"
            step="0.01"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
