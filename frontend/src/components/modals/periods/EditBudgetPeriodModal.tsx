import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { budgetPeriodsApi } from '../../../api/client'
import type { BudgetPeriod } from '../../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  period: BudgetPeriod | null
}

export default function EditBudgetPeriodModal({ isOpen, onClose, period }: Props) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (period && isOpen) {
      setName(period.name)
      setStartDate(period.start_date)
      setEndDate(period.end_date)
    }
  }, [period, isOpen])

  const updateMutation = useMutation({
    mutationFn: (data: any) => {
      if (!period) throw new Error('No period selected')
      return budgetPeriodsApi.update(period.id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-periods'] })
      queryClient.invalidateQueries({ queryKey: ['budget-period', period?.id] })
      toast.success('Budget period updated successfully!')
      onClose()
    },
    onError: (error: any) => {
      const message = error.response?.data?.detail || 'Failed to update budget period'
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
    updateMutation.mutate({
      name,
      start_date: startDate,
      end_date: endDate,
      weeks: calculateWeeks()
    })
  }

  const handleClose = () => {
    onClose()
    setName('')
    setStartDate('')
    setEndDate('')
  }

  if (!isOpen || !period) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Edit Budget Period</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Period Name *</label>
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
              onClick={handleClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
