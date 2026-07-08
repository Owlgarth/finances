import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../DatePicker'
import { budgetsApi, transactionsApi } from '../../../api/client'
import type { Transaction, TransactionType } from '../../../types'
import { useAccounts, useBudgets, useEnabledCurrencies } from '../../../hooks/useDomain'
import { getApiErrorMessage } from '../../../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, modalTitleClass } from '../../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  transaction?: Transaction | null
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'adjustment', label: 'Adjustment' },
]

export default function TransactionFormModal({ open, onClose, transaction }: Props) {
  const isEdit = !!transaction
  const queryClient = useQueryClient()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [budgetId, setBudgetId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [otherCurrency, setOtherCurrency] = useState(false)
  const [originalAmount, setOriginalAmount] = useState('')
  const [originalCurrencyCode, setOriginalCurrencyCode] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (transaction) {
      setDate(transaction.date)
      setDescription(transaction.description)
      setType(transaction.type)
      setAmount(transaction.amount)
      setAccountId(transaction.account_id)
      setCategoryId(transaction.category_id)
      setOtherCurrency(!!transaction.original_currency_code)
      setOriginalAmount(transaction.original_amount ?? '')
      setOriginalCurrencyCode(transaction.original_currency_code)
      setBudgetId(null)
    } else {
      setDate(new Date().toISOString().slice(0, 10))
      setDescription('')
      setType('expense')
      setAmount('')
      setAccountId(accounts.length === 1 ? accounts[0].id : null)
      setBudgetId(budgets.length === 1 ? budgets[0].id : null)
      setCategoryId(null)
      setOtherCurrency(false)
      setOriginalAmount('')
      setOriginalCurrencyCode(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, accounts.length, budgets.length])

  const account = accounts.find((a) => a.id === accountId)

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => budgetsApi.listCategories(budgetId!),
    enabled: open && !!budgetId && type !== 'adjustment',
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        date,
        description: description.trim(),
        type,
        amount,
        account_id: accountId,
        category_id: type === 'adjustment' ? null : categoryId,
        original_amount: otherCurrency ? originalAmount : null,
        original_currency_code: otherCurrency ? originalCurrencyCode : null,
      }
      return isEdit ? transactionsApi.update(transaction.id, payload) : transactionsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      toast.success(isEdit ? 'Transaction updated' : 'Transaction added')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to save transaction')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim()) return toast.error('Description is required')
    if (!amount) return toast.error('Amount is required')
    if (!accountId && accounts.length !== 1) return toast.error('Choose an account')
    mutation.mutate()
  }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))
  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const otherCurrencyOptions = useMemo(
    () => currencies.filter((c) => c.code !== account?.currency_code).map((c) => ({ value: c.code, label: c.code })),
    [currencies, account?.currency_code],
  )

  return (
    <Modal open={open} onClose={onClose} className="p-6">
      <h2 className={modalTitleClass}>{isEdit ? 'Edit transaction' : 'New transaction'}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Type</label>
            <Select value={type} onChange={setType} options={TYPE_OPTIONS} aria-label="Transaction type" />
          </div>
          <div>
            <label htmlFor="tx-amount" className={labelClass}>
              {type === 'adjustment' ? 'Delta amount' : 'Amount'} {account ? `(${account.currency_code})` : ''}
            </label>
            <input id="tx-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus />
          </div>
        </div>

        <div>
          <label htmlFor="tx-desc" className={labelClass}>Description</label>
          <input id="tx-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>

        {accounts.length > 1 && (
          <div>
            <label className={labelClass}>Account</label>
            <Select value={accountId} onChange={setAccountId} options={accountOptions} placeholder="Select account" aria-label="Account" />
          </div>
        )}

        {type !== 'adjustment' && (
          <div className="grid grid-cols-2 gap-3">
            {budgets.length > 1 && (
              <div>
                <label className={labelClass}>Budget</label>
                <Select value={budgetId} onChange={(v) => { setBudgetId(v); setCategoryId(null) }} options={budgetOptions} placeholder="Budget" aria-label="Budget" />
              </div>
            )}
            <div className={budgets.length > 1 ? '' : 'col-span-2'}>
              <label className={labelClass}>Category (optional)</label>
              <Select value={categoryId} onChange={setCategoryId} options={categoryOptions} placeholder="Uncategorized" aria-label="Category" disabled={!budgetId} />
            </div>
          </div>
        )}

        <div>
          <label className={labelClass}>Date</label>
          <DatePicker value={date} onChange={setDate} />
        </div>

        {type !== 'adjustment' && otherCurrencyOptions.length > 0 && (
          <div>
            <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input type="checkbox" checked={otherCurrency} onChange={(e) => setOtherCurrency(e.target.checked)} />
              Paid in another currency?
            </label>
            {otherCurrency && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input type="number" step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} placeholder="Original amount" className={inputClass} />
                <Select value={originalCurrencyCode} onChange={setOriginalCurrencyCode} options={otherCurrencyOptions} placeholder="Currency" aria-label="Original currency" mono />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
