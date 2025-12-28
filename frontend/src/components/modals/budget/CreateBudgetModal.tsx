import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { budgetsApi, categoriesApi, budgetPeriodsApi } from '../../../api/client'
import type { Category, BudgetPeriod } from '../../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  periodId?: number
}

const CURRENCIES = ['PLN', 'USD', 'EUR', 'UAH']

export default function CreateBudgetModal({ isOpen, onClose, periodId: initialPeriodId }: Props) {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | ''>(initialPeriodId || '')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [currency, setCurrency] = useState('PLN')
  const [amount, setAmount] = useState('')
  const queryClient = useQueryClient()

  // Update selectedPeriodId when initialPeriodId changes
  useEffect(() => {
    if (initialPeriodId) {
      setSelectedPeriodId(initialPeriodId)
    }
  }, [initialPeriodId, isOpen])

  const { data: budgetPeriods, isLoading: isLoadingPeriods } = useQuery<BudgetPeriod[]>({
    queryKey: ['budgetPeriods'],
    queryFn: async () => {
      const response = await budgetPeriodsApi.getAll();
      return response.data;
    },
    enabled: isOpen,
  })

  const { data: categories, isLoading: isLoadingCategories, error: categoriesError } = useQuery<Category[]>({
    queryKey: ['categories', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return [];
      const response = await categoriesApi.getAll({ budget_period_id: selectedPeriodId });
      return response.data;
    },
    enabled: !!selectedPeriodId && isOpen,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => budgetsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-summary', selectedPeriodId] })
      toast.success('Budget created successfully!')
      onClose()
      setCategoryId('')
      setAmount('')
      setCurrency('PLN')
    },
    onError: (error: any) => {
      // Don't show error for offline mode - the interceptor already shows a success toast
      // and performs the optimistic update
      if (error?.name === 'OfflineError') {
        onClose()
        setCategoryId('')
        setAmount('')
        setCurrency('PLN')
        return
      }
      toast.error('Failed to create budget')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPeriodId) {
      toast.error('Please select a budget period');
      return;
    }
    if (!categoryId) {
      toast.error('Please select a category');
      return;
    }
    createMutation.mutate({
      budget_period_id: Number(selectedPeriodId),
      category_id: Number(categoryId),
      currency,
      amount: parseFloat(amount)
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Budget</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Budget Period *</label>
            {isLoadingPeriods ? (
              <p className="text-sm text-gray-500">Loading budget periods...</p>
            ) : (
              <select
                value={selectedPeriodId}
                onChange={(e) => {
                  setSelectedPeriodId(Number(e.target.value))
                  setCategoryId('') // Reset category when period changes
                }}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Select budget period</option>
                {budgetPeriods?.map(period => (
                  <option key={period.id} value={period.id}>{period.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Category *</label>
            {!selectedPeriodId ? (
              <p className="text-sm text-gray-500">Please select a budget period first</p>
            ) : isLoadingCategories ? (
              <p className="text-sm text-gray-500">Loading categories...</p>
            ) : categoriesError ? (
              <p className="text-red-500 text-sm">Error loading categories</p>
            ) : categories && categories.length === 0 ? (
              <p className="text-yellow-600 text-sm">No categories found for this period</p>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full border rounded px-3 py-2"
                required
                disabled={!selectedPeriodId}
              >
                <option value="">Select category</option>
                {categories?.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="mb-4">
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

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Amount *</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="1400.00"
              required
            />
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
              {createMutation.isPending ? 'Creating...' : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}