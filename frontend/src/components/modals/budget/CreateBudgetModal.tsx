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

        <h2 className="font-headline font-bold text-on-surface text-xl mb-6">Create Budget</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Budget Period *</label>
            {isLoadingPeriods ? (
              <p className="text-sm text-on-surface-variant italic">Loading budget periods...</p>
            ) : (
              <select
                value={selectedPeriodId}
                onChange={(e) => {
                  setSelectedPeriodId(Number(e.target.value))
                  setCategoryId('') // Reset category when period changes
                }}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
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
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Category *</label>
            {!selectedPeriodId ? (
              <p className="text-sm text-on-surface-variant">Please select a budget period first</p>
            ) : isLoadingCategories ? (
              <p className="text-sm text-on-surface-variant italic">Loading categories...</p>
            ) : categoriesError ? (
              <p className="text-error text-sm">Error loading categories</p>
            ) : categories && categories.length === 0 ? (
              <p className="text-on-secondary-container bg-secondary-container/20 px-3 py-1 rounded-lg text-sm">No categories found for this period</p>
            ) : (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all disabled:opacity-50"
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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

            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Amount *</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
                placeholder="1400.00"
                required
              />
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
              {createMutation.isPending ? 'Creating...' : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
