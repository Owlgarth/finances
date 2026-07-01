import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { plannedTransactionsApi, categoriesApi } from '../../../api/client'
import type { PlannedTransaction, Category, PaginatedResponse } from '../../../types'
import { useBudgetPeriod } from '../../../contexts/BudgetPeriodContext'
import { format } from 'date-fns'
import DatePicker from '../../DatePicker'
import Modal from '../../common/Modal'
import Select from '../../common/Select'

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
      return (response.data as PaginatedResponse<Category>).items
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
      queryClient.invalidateQueries({ queryKey: ['planned-transactions-totals-category'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions-totals'] })
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
    <Modal open={isOpen} onClose={onClose} size="md" className="p-6">
        <h2 className="font-sans font-semibold text-text text-sm mb-6">
          {plannedTransaction ? 'Edit Planned Transaction' : 'New Planned Transaction'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Planned Date *</label>
            <DatePicker
              value={plannedDate}
              onChange={(value) => setPlannedDate(value)}
              className="w-full"
              required
              inline
            />
          </div>

          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder="Monthly subscription"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Category</label>
            {selectedPeriod && (
              <p className="font-mono text-[8px] text-text-muted/60 uppercase mb-1">
                Period: {selectedPeriod.name}
              </p>
            )}
            {isLoadingCategories ? (
              <p className="text-sm text-text-muted italic">Loading categories...</p>
            ) : categoriesError ? (
              <p className="text-negative text-sm">Error loading categories</p>
            ) : !selectedPeriodId ? (
              <p className="text-text bg-surface-hover px-3 py-1 rounded-sm text-sm">No budget period selected</p>
            ) : (
              <Select
                value={categoryId === '' ? null : categoryId}
                onChange={(v) => setCategoryId(v)}
                options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Select category (optional)"
                aria-label="Category"
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Amount *</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-surface border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
                placeholder="100.00"
                required
              />
            </div>

            <div>
              <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Currency *</label>
              <Select
                value={currency}
                onChange={(v) => setCurrency(v)}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                mono
                aria-label="Currency"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Status *</label>
            <Select
              value={status}
              onChange={(v) => setStatus(v)}
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'done', label: 'Done' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              aria-label="Status"
            />
          </div>

          <div className="flex justify-end space-x-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm hover:bg-surface-hover transition-colors text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-primary text-white px-3 py-1.5 rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
              disabled={mutation.isPending || isLoadingCategories || !!categoriesError}
            >
              {mutation.isPending ? 'Saving...' : 'Save Planned Transaction'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
