import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { periodBalancesApi } from '../../api/client'
import type { PeriodBalance } from '../../types'
import BalanceBar from './BalanceBar'
import BalanceDetailModal from '../modals/balance/BalanceDetailModal'
import EditPeriodBalanceModal from '../modals/balance/EditPeriodBalanceModal'

interface Props {
  periodId: number
}

export default function BalanceSection({ periodId }: Props) {
  const queryClient = useQueryClient()
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [detailBalance, setDetailBalance] = useState<PeriodBalance | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editBalance, setEditBalance] = useState<PeriodBalance | null>(null)

  const { data: balances, isLoading } = useQuery({
    queryKey: ['period-balances', periodId],
    queryFn: async () => {
      const response = await periodBalancesApi.getAll(periodId)
      return response.data as PeriodBalance[]
    }
  })

  const recalculateMutation = useMutation({
    mutationFn: ({ currency }: { currency: string }) =>
      periodBalancesApi.recalculate(periodId, currency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period-balances', periodId] })
      toast.success('Balance recalculated successfully!')
    },
    onError: () => {
      toast.error('Failed to recalculate balance')
    }
  })

  const handleSelectBalance = (balance: PeriodBalance) => {
    setDetailBalance(balance)
    setIsDetailModalOpen(true)
  }

  const handleEditFromDetail = (balance: PeriodBalance) => {
    setEditBalance(balance)
    setIsEditModalOpen(true)
  }

  if (isLoading) return <div>Loading balances...</div>

  return (
    <div className="mb-12">
      <h2 className="text-sm font-medium text-text mb-8">Balances</h2>

      <BalanceBar
        balances={balances || []}
        onSelect={handleSelectBalance}
      />

      {balances?.length === 0 && (
        <p className="text-text-muted">No balances yet. Add some transactions!</p>
      )}

      <BalanceDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false)
          setDetailBalance(null)
        }}
        balance={detailBalance}
        onEdit={handleEditFromDetail}
        onRecalculate={(currency) => recalculateMutation.mutate({ currency })}
      />

      <EditPeriodBalanceModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditBalance(null)
        }}
        balance={editBalance}
      />
    </div>
  )
}
