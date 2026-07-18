import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, Trash2 } from 'lucide-react'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../DatePicker'
import TransactionItemsEditor from '../../transactions/TransactionItemsEditor'
import TransactionAttachments from '../../transactions/TransactionAttachments'
import { budgetsApi, transactionsApi } from '../../../api/client'
import type { Transaction, TransactionType } from '../../../types'
import { useAccounts, useBudgets, useEnabledCurrencies } from '../../../hooks/useDomain'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../../utils/errors'
import { destructiveButtonClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  transaction?: Transaction | null
  /** Copy mode: prefill every field from this transaction except the date
      (today instead) and save as a NEW transaction. Ignored while editing. */
  copyFrom?: Transaction | null
  /** Edit mode only: renders a Delete button in the footer. Caller owns the
      confirm flow (and closing this modal). */
  onDelete?: (transaction: Transaction) => void
  /** Edit mode only: renders a Copy button in the footer. Caller switches the
      modal into copy mode (transaction=null, copyFrom=t). */
  onCopy?: (transaction: Transaction) => void
}

const TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'adjustment', label: 'Adjustment' },
]

export default function TransactionFormModal({ open, onClose, transaction, copyFrom, onDelete, onCopy }: Props) {
  const isEdit = !!transaction
  const queryClient = useQueryClient()
  const { workspace } = useWorkspace()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: currencies = [] } = useEnabledCurrencies()

  const defaultBudgetId =
    budgets.length === 1 ? budgets[0].id : (budgets.find((b) => b.id === workspace?.default_budget_id)?.id ?? null)

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
  const [detailTab, setDetailTab] = useState<'items' | 'receipts' | null>(null)

  useEffect(() => {
    if (!open) return
    setDetailTab(null)
    // Copy mode prefills like edit, except the date: always today (D4).
    const source = transaction ?? copyFrom
    if (source) {
      setDate(transaction ? source.date : new Date().toISOString().slice(0, 10))
      setDescription(source.description)
      setType(source.type)
      setAmount(source.amount)
      setAccountId(source.account_id)
      setCategoryId(source.category_id)
      setOtherCurrency(!!source.original_currency_code)
      setOriginalAmount(source.original_amount ?? '')
      setOriginalCurrencyCode(source.original_currency_code)
      setBudgetId(source.category_budget_id)
    } else {
      setDate(new Date().toISOString().slice(0, 10))
      setDescription('')
      setType('expense')
      setAmount('')
      setAccountId(accounts.length === 1 ? accounts[0].id : null)
      setBudgetId(defaultBudgetId)
      setCategoryId(null)
      setOtherCurrency(false)
      setOriginalAmount('')
      setOriginalCurrencyCode(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction, copyFrom, accounts.length, budgets.length, defaultBudgetId])

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
    <Modal open={open} onClose={onClose} className="p-6 max-h-[90vh] overflow-y-auto" title={isEdit ? 'Edit transaction' : 'New transaction'}>
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
            <input id="tx-amount" type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus />
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
                <input type="number" inputMode="decimal" step="0.01" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} placeholder="Original amount" className={inputClass} />
                <Select value={originalCurrencyCode} onChange={setOriginalCurrencyCode} options={otherCurrencyOptions} placeholder="Currency" aria-label="Original currency" mono />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {/* Two separate, individually clickable actions (never a menu). */}
          {isEdit && transaction && (
            <div className="flex items-center gap-2">
              {onCopy && (
                <button type="button" onClick={() => onCopy(transaction)} className={secondaryButtonClass}>
                  <Copy size={13} className="inline mr-1" /> Copy
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(transaction)} className={destructiveButtonClass}>
                  <Trash2 size={13} className="inline mr-1" /> Delete
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
            <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </form>

      {isEdit && transaction && (
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center gap-1 mb-3">
            {(['items', 'receipts'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDetailTab(tab)}
                className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors ${
                  detailTab === tab ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          {detailTab === 'items' && <TransactionItemsEditor transaction={transaction} />}
          {detailTab === 'receipts' && <TransactionAttachments transaction={transaction} />}
        </div>
      )}
    </Modal>
  )
}
