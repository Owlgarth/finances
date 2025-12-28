import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { transactionsApi, categoriesApi } from '../../../api/client'
import type { Transaction, Category } from '../../../types'
import { useBudgetPeriod } from '../../../contexts/BudgetPeriodContext'
import { format } from 'date-fns'

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
      // Force refetch of period-balances to ensure UI updates immediately
      // This is needed because the app uses persistent cache with staleTime
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success(transaction ? 'Transaction updated successfully!' : 'Transaction created successfully!')
      onClose()
    },
    onError: (error: any) => {
      // Don't show error for offline mode - the interceptor already shows a success toast
      // and performs the optimistic update
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {transaction ? 'Edit Transaction' : 'New Transaction'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Description *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Grocery shopping"
              required
            />
          </div>

          {type === 'expense' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Category</label>
              {selectedPeriod && (
                <p className="text-xs text-gray-500 mb-1">
                  Period: {selectedPeriod.name}
                </p>
              )}
              {isLoadingCategories ? (
                <p className="text-sm text-gray-500">Loading categories...</p>
              ) : categoriesError ? (
                <p className="text-red-500 text-sm">Error loading categories</p>
              ) : !selectedPeriodId ? (
                <p className="text-yellow-600 text-sm">No budget period selected</p>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(Number(e.target.value))}
                  className="w-full border rounded px-3 py-2"
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
              <label className="block text-sm font-medium mb-1">Amount *</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="100.00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Currency *</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                {CURRENCIES.map(cur => (
                  <option key={cur} value={cur}>{cur}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Type *</label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="expense"
                  checked={type === 'expense'}
                  onChange={(e) => {
                    setType(e.target.value as 'expense')
                  }}
                  className="mr-2"
                />
                Expense
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="income"
                  checked={type === 'income'}
                  onChange={(e) => {
                    setType(e.target.value as 'income')
                    setCategoryId('') // Clear category for income
                  }}
                  className="mr-2"
                />
                Income
              </label>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              disabled={createMutation.isPending || isLoadingCategories || !!categoriesError}
            >
              {createMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}