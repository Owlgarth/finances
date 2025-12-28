import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { budgetPeriodsApi, budgetsApi } from '../api/client'
import type { BudgetPeriod as BudgetPeriodType } from '../types'
import BalanceSection from '../components/balance/BalanceSection'
import BudgetSummarySection from '../components/budget/BudgetSummarySection'
import CreateBudgetModal from '../components/modals/budget/CreateBudgetModal'
import EditBudgetModal from '../components/modals/budget/EditBudgetModal'
import Loading from '../components/common/Loading'
import ErrorMessage from '../components/common/ErrorMessage'

interface CategoryBudget {
  id: number
  category_id: number
  category: string
  currency: string
  budget: number
  actual: number
  difference: number
}

export default function BudgetPeriod() {
  const { id } = useParams()
  const periodId = Number(id)
  const queryClient = useQueryClient()
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedBudget, setSelectedBudget] = useState<CategoryBudget | null>(null)

  const { data: period, isLoading, error } = useQuery({
    queryKey: ['budget-period', periodId],
    queryFn: async () => {
      const response = await budgetPeriodsApi.getOne(periodId)
      return response.data as BudgetPeriodType
    },
    enabled: !!periodId
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => budgetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-summary', periodId] })
      toast.success('Budget deleted successfully!')
    },
    onError: () => {
      toast.error('Failed to delete budget')
    }
  })

  const handleEdit = (budget: CategoryBudget) => {
    setSelectedBudget(budget)
    setIsEditModalOpen(true)
  }

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this budget?')) {
      deleteMutation.mutate(id)
    }
  }

  if (isLoading) return <Loading />
  if (error) return <ErrorMessage message="Failed to load budget period" />

  return (
    <div className="max-w-screen-2xl mx-auto">

      {period && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 md:p-8 mb-8 sm:mb-12">
          <h1 className="text-3xl font-semibold mb-3 text-gray-900">{period.name}</h1>
          <p className="text-gray-500">
            {period.start_date} - {period.end_date} • {period.weeks} weeks
          </p>
        </div>
      )}

      <BalanceSection periodId={periodId} />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 mt-8 sm:mt-12">
        <h2 className="text-2xl font-semibold text-gray-900">Budget vs Actual</h2>
        <button
          onClick={() => setIsBudgetModalOpen(true)}
          className="bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition-colors font-medium"
        >
          Add Budget
        </button>
      </div>

      <BudgetSummarySection
        periodId={periodId}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <CreateBudgetModal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        periodId={periodId}
      />

      <EditBudgetModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedBudget(null)
        }}
        budget={selectedBudget}
        periodId={periodId}
      />
    </div>
  )
}