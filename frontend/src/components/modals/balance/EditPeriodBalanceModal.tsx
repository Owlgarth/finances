import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { X } from 'lucide-react'
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
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center z-50 p-4 backdrop-blur-[1px]">
      <div className="bg-surface border border-border rounded-sm p-6 w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={14} />
        </button>

        <h2 className="font-semibold text-text text-sm mb-6">Edit Opening Balance</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Currency</label>
            <input
              type="text"
              value={balance.currency}
              className="w-full bg-surface-muted border border-border rounded-none px-3 py-2 font-mono text-sm text-text-muted cursor-not-allowed"
              disabled
            />
          </div>

          <div className="mb-6">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Opening Balance *</label>
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="w-full bg-surface border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:outline-none focus:border-border-focus transition-colors"
              placeholder="0.00"
              required
            />
            <p className="font-mono text-[9px] text-text-muted mt-2">
              Changing the opening balance will automatically update the closing balance.
            </p>
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
