import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
import { budgetPeriodsApi } from '../../../api/client'
import type { BudgetPeriod } from '../../../types'
import DatePicker from '../../DatePicker'

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
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center z-50 p-4 backdrop-blur-[1px]">
      <div className="bg-surface border border-border rounded-sm p-6 w-full max-w-md relative">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={14} />
        </button>

        <h2 className="font-sans font-semibold text-text text-sm mb-6">Edit Budget Period</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Period Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              placeholder="November 2025"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Start Date *</label>
            <DatePicker
              value={startDate}
              onChange={(value) => setStartDate(value)}
              className="w-full"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">End Date *</label>
            <DatePicker
              value={endDate}
              onChange={(value) => setEndDate(value)}
              className="w-full"
              required
            />
          </div>

          {startDate && endDate && (
            <div className="mb-6 font-mono text-[10px] text-text-muted uppercase tracking-wider">
              Period length: <span className="font-bold text-text">{calculateWeeks()} weeks</span>
            </div>
          )}

          <div className="flex justify-end space-x-3 mt-8">
            <button
              type="button"
              onClick={handleClose}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm hover:bg-surface-hover transition-colors text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-primary text-white px-3 py-1.5 rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
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
