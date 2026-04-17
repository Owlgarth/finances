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
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center z-50 p-4 backdrop-blur-[1px]">
      <div className="bg-surface border border-border rounded-sm p-6 w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={14} />
        </button>

        <h2 className="font-sans font-semibold text-text text-sm mb-4">Copy Budget Period</h2>
        
        <div className="mb-4 p-3 bg-surface-hover rounded-sm">
          <p className="text-xs text-text-muted uppercase font-mono tracking-wider">
            Copying from: <span className="font-bold text-text">{sourcePeriod.name}</span>
          </p>
        </div>

        <p className="text-sm text-text-muted mb-6 font-sans leading-relaxed">
          This will copy all categories, budgets, and planned transactions.
          Planned transaction dates will be adjusted to the new period, and all
          statuses will be reset to "pending".
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">New Period Name *</label>
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
              onClick={onClose}
              className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm hover:bg-surface-hover transition-colors text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-primary text-white px-3 py-1.5 rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
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
