import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { budgetPeriodsApi } from '../../../api/client'
import type { BudgetPeriod } from '../../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  sourcePeriod: BudgetPeriod | null
}

export default function CopyBudgetPeriodModal({ isOpen, onClose, sourcePeriod }: Props) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (sourcePeriod && isOpen) {
      // Pre-fill with suggested values based on source period
      setName(`${sourcePeriod.name} (Copy)`)
      setStartDate('')
      setEndDate('')
    }
  }, [sourcePeriod, isOpen])

  const copyMutation = useMutation({
    mutationFn: (data: any) => {
      if (!sourcePeriod) throw new Error('No source period selected')
      return budgetPeriodsApi.copy(sourcePeriod.id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-periods'] })
      toast.success('Budget period copied successfully!')
      onClose()
      setName('')
      setStartDate('')
      setEndDate('')
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to copy budget period'
      toast.error(message)
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
    copyMutation.mutate({
      name,
      start_date: startDate,
      end_date: endDate,
      weeks: calculateWeeks()
    })
  }

  if (!isOpen || !sourcePeriod) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Copy Budget Period</h2>
        <p className="text-sm text-gray-600 mb-4">
          Copying from: <span className="font-medium">{sourcePeriod.name}</span>
        </p>
        <p className="text-sm text-gray-500 mb-6">
          This will copy all categories, budgets, and planned transactions.
          Planned transaction dates will be adjusted to the new period, and all
          statuses will be reset to "pending".
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">New Period Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="November 2025"
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
              disabled={copyMutation.isPending}
            >
              {copyMutation.isPending ? 'Copying...' : 'Copy Period'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
