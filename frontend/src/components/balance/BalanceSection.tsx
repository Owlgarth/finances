import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { periodBalancesApi } from '../../api/client'
import type { PeriodBalance } from '../../types'
import BalanceCard from './BalanceCard'
import EditPeriodBalanceModal from '../modals/balance/EditPeriodBalanceModal'

interface Props {
  periodId: number
}

export default function BalanceSection({ periodId }: Props) {
  const queryClient = useQueryClient()
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedBalance, setSelectedBalance] = useState<PeriodBalance | null>(null)

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

  const handleEdit = (balance: PeriodBalance) => {
    setSelectedBalance(balance)
    setIsEditModalOpen(true)
  }

  if (isLoading) return <div>Loading balances...</div>

  return (
    <div className="mb-12">
      <h2 className="text-2xl font-semibold text-gray-900 mb-8">Balances</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {balances?.map(balance => (
          <BalanceCard
            key={balance.id}
            balance={balance}
            onEdit={() => handleEdit(balance)}
            onRecalculate={() => recalculateMutation.mutate({ currency: balance.currency })}
          />
        ))}
      </div>

      {balances?.length === 0 && (
        <p className="text-gray-500">No balances yet. Add some transactions!</p>
      )}

      <EditPeriodBalanceModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedBalance(null)
        }}
        balance={selectedBalance}
      />
    </div>
  )
}