import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { plannedTransactionsApi } from '../../../api/client'
import DatePicker from '../../DatePicker'

interface Props {
  isOpen: boolean
  onClose: () => void
  plannedId: number
}

export default function ExecutePlannedModal({ isOpen, onClose, plannedId }: Props) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const queryClient = useQueryClient()

  const executeMutation = useMutation({
    mutationFn: () => plannedTransactionsApi.execute(plannedId, paymentDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
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

        <h2 className="font-headline font-bold text-on-surface text-xl mb-6">Mark as Done</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Payment Date *</label>
            <DatePicker
              value={paymentDate}
              onChange={(value) => setPaymentDate(value)}
              className="w-full"
              required
            />
          </div>

          <p className="text-sm text-on-surface-variant mb-6 font-headline">
            This will create an actual transaction and mark the planned transaction as done.
          </p>

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
              disabled={executeMutation.isPending}
            >
              {executeMutation.isPending ? 'Processing...' : 'Mark Done'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
