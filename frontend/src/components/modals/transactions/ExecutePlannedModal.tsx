import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { plannedTransactionsApi } from '../../../api/client'
import DatePicker from '../../DatePicker'
import Modal from '../../common/Modal'

interface Props {
  isOpen: boolean
  onClose: () => void
  plannedId: number
  plannedDate: string
}

export default function ExecutePlannedModal({ isOpen, onClose, plannedId, plannedDate }: Props) {
  const [paymentDate, setPaymentDate] = useState(plannedDate)
  const queryClient = useQueryClient()

  const executeMutation = useMutation({
    mutationFn: () => plannedTransactionsApi.execute(plannedId, paymentDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['planned-transactions-totals-category'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions-totals'] })
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] })
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success('Planned transaction executed successfully!')
      onClose()
    },
    onError: (error: any) => {
      if (error?.name === 'OfflineError') {
        onClose()
        return
      }
      toast.error('Failed to execute planned transaction')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    executeMutation.mutate()
  }

  if (!isOpen) return null

  return (
    <Modal open={isOpen} onClose={onClose} size="md" className="p-6">
        <h2 className="font-sans font-semibold text-text text-sm mb-6">Mark as Done</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Payment Date *</label>
            <DatePicker
              value={paymentDate}
              onChange={(value) => setPaymentDate(value)}
              className="w-full"
              required
            />
          </div>

          <p className="text-sm text-text-muted mb-6">
            This will create an actual transaction and mark the planned transaction as done.
          </p>

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
              disabled={executeMutation.isPending}
            >
              {executeMutation.isPending ? 'Processing...' : 'Mark Done'}
            </button>
          </div>
        </form>
    </Modal>
  )
}
