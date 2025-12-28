import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { plannedTransactionsApi } from '../../../api/client'

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
      // Force refetch of period-balances to ensure UI updates immediately
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success('Planned transaction executed successfully!')
      onClose()
    },
    onError: (error: any) => {
      // Don't show error for offline mode - the interceptor already shows a success toast
      // and performs the optimistic update
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Mark as Done</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Payment Date *</label>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <p className="text-sm text-gray-600 mb-4">
            This will create an actual transaction and mark the planned transaction as done.
          </p>

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
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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