import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { budgetPeriodsApi } from '../../../api/client'
import { useBudgetAccount } from '../../../contexts/BudgetAccountContext'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function CreatePeriodModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const queryClient = useQueryClient()
  const { selectedAccountId, selectedAccount } = useBudgetAccount()

  const createMutation = useMutation({
    mutationFn: (data: any) => budgetPeriodsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-periods'] })
      toast.success('Budget period created successfully!')
      onClose()
      setName('')
      setStartDate('')
      setEndDate('')
    },
    onError: (error: any) => {
      // Don't show error for offline mode - the interceptor already shows a success toast
      // and performs the optimistic update
      if (error?.name === 'OfflineError') {
        onClose()
        setName('')
        setStartDate('')
        setEndDate('')
        return
      }
      toast.error('Failed to create budget period')
    }
  })

  const calculateWeeks = () => {
    if (!startDate || !endDate) return 0
    const start = new Date(startDate)
    const end = new Date(endDate)
    const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return Math.floor(days / 7)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAccountId) {
      toast.error('Please select a budget account first')
      return
    }
    createMutation.mutate({
      name,
      start_date: startDate,
      end_date: endDate,
      weeks: calculateWeeks(),
      budget_account_id: selectedAccountId,
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Budget Period</h2>

        {selectedAccount && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">
              Creating period in: <span className="font-medium text-gray-900">{selectedAccount.icon} {selectedAccount.name}</span>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Period Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="September 2025"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">End Date *</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          {startDate && endDate && (
            <div className="mb-4 text-sm text-gray-600">
              Period length: {calculateWeeks()} weeks
            </div>
          )}

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
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Period'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}