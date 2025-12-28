import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { periodBalancesApi } from '../../../api/client'
import type { PeriodBalance } from '../../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  balance: PeriodBalance | null
}

export default function EditPeriodBalanceModal({ isOpen, onClose, balance }: Props) {
  const [openingBalance, setOpeningBalance] = useState('')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isOpen && balance) {
      setOpeningBalance(balance.opening_balance.toString())
    }
  }, [isOpen, balance])

  const updateMutation = useMutation({
    mutationFn: (data: { opening_balance: number }) =>
      periodBalancesApi.update(balance!.id, data),
    onSuccess: () => {
      // Force refetch of period-balances to ensure UI updates immediately
      queryClient.refetchQueries({ queryKey: ['period-balances'] })
      toast.success('Opening balance updated successfully!')
      onClose()
    },
    onError: (error: any) => {
      // Don't show error for offline mode - the interceptor already shows a success toast
      // and performs the optimistic update
      if (error?.name === 'OfflineError') {
        onClose()
        return
      }
      toast.error('Failed to update opening balance')
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      opening_balance: parseFloat(openingBalance)
    })
  }

  if (!isOpen || !balance) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Edit Opening Balance</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Currency</label>
            <input
              type="text"
              value={balance.currency}
              className="w-full border rounded px-3 py-2 bg-gray-100"
              disabled
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Opening Balance *</label>
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="0.00"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Changing the opening balance will automatically update the closing balance.
            </p>
          </div>

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
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Updating...' : 'Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
