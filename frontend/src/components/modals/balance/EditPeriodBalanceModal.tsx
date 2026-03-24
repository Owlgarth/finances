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

        <h2 className="font-headline font-bold text-on-surface text-xl mb-6">Edit Opening Balance</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Currency</label>
            <input
              type="text"
              value={balance.currency}
              className="w-full bg-surface-container border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface-variant cursor-not-allowed"
              disabled
            />
          </div>

          <div className="mb-6">
            <label className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">Opening Balance *</label>
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
              placeholder="0.00"
              required
            />
            <p className="font-mono text-[9px] text-on-surface-variant mt-2">
              Changing the opening balance will automatically update the closing balance.
            </p>
          </div>

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
