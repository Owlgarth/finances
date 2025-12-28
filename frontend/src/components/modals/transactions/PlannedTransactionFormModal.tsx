import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { plannedTransactionsApi, categoriesApi } from '../../../api/client'
import type { PlannedTransaction, Category } from '../../../types'
import { useBudgetPeriod } from '../../../contexts/BudgetPeriodContext'
import { format } from 'date-fns'

interface Props {
  isOpen: boolean
  onClose: () => void
  plannedTransaction?: PlannedTransaction | null
}

const CURRENCIES = ['PLN', 'USD', 'EUR', 'UAH']

export default function PlannedTransactionFormModal({ isOpen, onClose, plannedTransaction }: Props) {
  const [plannedDate, setPlannedDate] = useState('')
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('PLN')
  const [status, setStatus] = useState<'pending' | 'done' | 'cancelled'>('pending')
  const queryClient = useQueryClient()

  const today = format(new Date(), 'yyyy-MM-dd')
  const { selectedPeriod, selectedPeriodId } = useBudgetPeriod()

  const { data: categories, isLoading: isLoadingCategories, error: categoriesError } = useQuery<Category[]>({
    queryKey: ['categories', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return []
      const response = await categoriesApi.getAll({ budget_period_id: selectedPeriodId })
      return response.data
    },
    enabled: !!selectedPeriodId && isOpen,
  })

  useEffect(() => {
    if (plannedTransaction) {
      setPlannedDate(plannedTransaction.planned_date)
      setName(plannedTransaction.name)
      setCategoryId(plannedTransaction.category?.id || '')
      setAmount(plannedTransaction.amount.toString())
      setCurrency(plannedTransaction.currency)
      setStatus(plannedTransaction.status)
    } else {
      setPlannedDate(today)
      setName('')
      setCategoryId('')
      setAmount('')
      setCurrency('PLN')
      setStatus('pending')
    }
  }, [plannedTransaction, isOpen, today])

  const mutation = useMutation({
    mutationFn: (data: any) =>
      plannedTransaction
        ? plannedTransactionsApi.update(plannedTransaction.id, data)
        : plannedTransactionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-transactions'] })
      toast.success(plannedTransaction ? 'Planned transaction updated!' : 'Planned transaction created!')
      onClose()
    },
    onError: (error: any) => {
      // Don't show error for offline mode - the interceptor already shows a success toast
      // and performs the optimistic update
      if (error?.name === 'OfflineError') {
        onClose()
        return
      }
      toast.error(plannedTransaction ? 'Failed to update planned transaction' : 'Failed to create planned transaction')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      planned_date: plannedDate,
      name,
      category_id: categoryId ? Number(categoryId) : null,
      amount: parseFloat(amount),
      currency,
      status,
      budget_period_id: selectedPeriodId
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">
          {plannedTransaction ? 'Edit Planned Transaction' : 'New Planned Transaction'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Planned Date *</label>
            <input
              type="date"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Monthly subscription"
              required
            />
          </div>

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
            <label className="block text-sm font-medium mb-1">Status *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'pending' | 'done' | 'cancelled')}
              className="w-full border rounded px-3 py-2"
            >
              <option value="pending">Pending</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
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
              disabled={mutation.isPending || isLoadingCategories || !!categoriesError}
            >
              {mutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
