import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { plannedTransactionsApi, categoriesApi } from '../../../api/client'
import type { PlannedTransaction, Category } from '../../../types'
import { useBudgetPeriod } from '../../../contexts/BudgetPeriodContext'
import { format } from 'date-fns'
import DatePicker from '../../DatePicker'

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
          {plannedTransaction ? 'Edit Planned Transaction' : 'New Planned Transaction'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Planned Date *</label>
            <DatePicker
              value={plannedDate}
              onChange={(value) => setPlannedDate(value)}
              className="w-full"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              placeholder="Monthly subscription"
              required
            />
          </div>

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
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Status *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'pending' | 'done' | 'cancelled')}
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
            >
              <option value="pending">Pending</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
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
              disabled={mutation.isPending || isLoadingCategories || !!categoriesError}
            >
              {mutation.isPending ? 'Saving...' : 'Save Planned Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
