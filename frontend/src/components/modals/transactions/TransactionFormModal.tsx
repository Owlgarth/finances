import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { transactionsApi, categoriesApi } from '../../../api/client'
import type { Transaction, Category } from '../../../types'
import { useBudgetPeriod } from '../../../contexts/BudgetPeriodContext'
import { format } from 'date-fns'
import DatePicker from '../../DatePicker'

interface Props {
  isOpen: boolean
  onClose: () => void
  transaction?: Transaction | null
}

const CURRENCIES = ['PLN', 'USD', 'EUR', 'UAH']

export default function TransactionFormModal({ isOpen, onClose, transaction }: Props) {
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('PLN')
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const queryClient = useQueryClient()

  const today = format(new Date(), 'yyyy-MM-dd')
  const { selectedPeriod, selectedPeriodId } = useBudgetPeriod()

  const { data: categories, isLoading: isLoadingCategories, error: categoriesError } = useQuery<Category[]>({
    queryKey: ['categories', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return [];
      const response = await categoriesApi.getAll({ budget_period_id: selectedPeriodId });
      return response.data;
    },
    enabled: !!selectedPeriodId && isOpen,
  });

  useEffect(() => {
    if (transaction) {
      setDate(transaction.date)
      setDescription(transaction.description)
      setCategoryId(transaction.category?.id || '')
      setAmount(transaction.amount.toString())
      setCurrency(transaction.currency)
      setType(transaction.type)
    } else {
      setDate(today) // Set today's date for new transactions
      setDescription('')
      setCategoryId('')
      setAmount('')
      setCurrency('PLN')
      setType('expense')
    }
  }, [transaction, isOpen, today])

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      transaction
        ? transactionsApi.update(transaction.id, data)
        : transactionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] })
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success(transaction ? 'Transaction updated successfully!' : 'Transaction created successfully!')
      onClose()
    },
    onError: (error: any) => {
      if (error?.name === 'OfflineError') {
        onClose()
        return
      }
      toast.error(transaction ? 'Failed to update transaction' : 'Failed to create transaction')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      date,
      description,
      category_id: categoryId ? Number(categoryId) : null,
      amount: parseFloat(amount),
      currency,
      type,
      budget_period_id: selectedPeriodId
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center z-50 p-4 backdrop-blur-[1px]">
      <div 
        className="bg-surface-container-lowest rounded-xl p-6 w-full max-w-md relative"
        style={{ boxShadow: 'var(--shadow-float)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <h2 className="font-headline font-bold text-on-surface text-xl mb-6">
          {transaction ? 'Edit Transaction' : 'New Transaction'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Date *</label>
            <DatePicker
              value={date}
              onChange={(value) => setDate(value)}
              className="w-full"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Description *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              placeholder="Grocery shopping"
              required
            />
          </div>

          {type === 'expense' && (
            <div className="mb-4">
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Category</label>
              {selectedPeriod && (
                <p className="font-mono text-[8px] text-on-surface-variant/60 uppercase mb-1">
                  Period: {selectedPeriod.name}
                </p>
              )}
              {isLoadingCategories ? (
                <p className="text-sm text-on-surface-variant italic">Loading categories...</p>
              ) : categoriesError ? (
                <p className="text-error text-sm">Error loading categories</p>
              ) : !selectedPeriodId ? (
                <p className="text-on-secondary-container bg-secondary-container/20 px-3 py-1 rounded-lg text-sm">No budget period selected</p>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                  className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
                >
                  <option value="">Select category (optional)</option>
                  {categories?.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Amount *</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
                placeholder="100.00"
                required
              />
            </div>

            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Currency *</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              >
                {CURRENCIES.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-6">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-2">Type *</label>
            <div className="flex space-x-6">
              <label className="flex items-center cursor-pointer group">
                <input
                  type="radio"
                  value="expense"
                  checked={type === 'expense'}
                  onChange={(e) => setType(e.target.value as 'expense')}
                  className="w-4 h-4 text-primary bg-surface-container-highest border-none focus:ring-primary-container"
                />
                <span className="ml-2 font-headline text-sm text-on-surface select-none group-hover:text-primary transition-colors">Expense</span>
              </label>
              <label className="flex items-center cursor-pointer group">
                <input
                  type="radio"
                  value="income"
                  checked={type === 'income'}
                  onChange={(e) => {
                    setType(e.target.value as 'income')
                    setCategoryId('') // Clear category for income
                  }}
                  className="w-4 h-4 text-primary bg-surface-container-highest border-none focus:ring-primary-container"
                />
                <span className="ml-2 font-headline text-sm text-on-surface select-none group-hover:text-primary transition-colors">Income</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg hover:bg-surface-container transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-6 py-2 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold shadow-sm"
              disabled={createMutation.isPending || isLoadingCategories || !!categoriesError}
            >
              {createMutation.isPending ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
