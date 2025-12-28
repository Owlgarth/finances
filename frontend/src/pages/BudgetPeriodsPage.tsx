import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { budgetPeriodsApi } from '../api/client'
import { usePermissions } from '../hooks/usePermissions'
import { useBudgetAccount } from '../contexts/BudgetAccountContext'
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext'
import type {BudgetPeriod} from "../types";
import CreatePeriodModal from '../components/modals/periods/CreatePeriodModal'
import CopyBudgetPeriodModal from '../components/modals/periods/CopyBudgetPeriodModal'
import EditBudgetPeriodModal from '../components/modals/periods/EditBudgetPeriodModal'
import Loading from '../components/common/Loading'
import ErrorMessage from '../components/common/ErrorMessage'
import EmptyState from '../components/common/EmptyState'

export default function BudgetPeriodsPage() {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
    const [selectedPeriodToCopy, setSelectedPeriodToCopy] = useState<BudgetPeriod | null>(null)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [selectedPeriodToEdit, setSelectedPeriodToEdit] = useState<BudgetPeriod | null>(null)
    const { canManageBudgetData } = usePermissions()
    const { selectedAccountId } = useBudgetAccount()
    const { setSelectedPeriodId } = useBudgetPeriod()
    const navigate = useNavigate()

  const { data: periods, isLoading, error } = useQuery({
    queryKey: ['budget-periods', selectedAccountId],
    queryFn: async () => {
      const response = await budgetPeriodsApi.getAll(selectedAccountId ?? undefined)
      return response.data as BudgetPeriod[]
    }
  })

  if (isLoading) return <Loading />
  if (error) return <ErrorMessage message="Failed to load budget periods" />

  return (
    <div className="max-w-screen-2xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 sm:mb-12">
        <h1 className="text-3xl font-semibold text-gray-900">Budget Periods</h1>
        {canManageBudgetData && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Create Period
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {periods?.map(period => (
          <div
            key={period.id}
            onClick={() => {
              setSelectedPeriodId(period.id)
              navigate(`/period/${period.id}`)
            }}
            className="bg-white p-4 sm:p-6 md:p-8 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all relative group cursor-pointer"
          >
            <h2 className="text-lg font-semibold mb-3 text-gray-900">{period.name}</h2>
            <p className="text-gray-500 text-sm mb-1">
              {period.start_date} - {period.end_date}
            </p>
            {period.weeks && (
              <p className="text-gray-400 text-sm">{period.weeks} weeks</p>
            )}
            {canManageBudgetData && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedPeriodToEdit(period)
                    setIsEditModalOpen(true)
                  }}
                  className="absolute top-4 right-20 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 text-sm font-medium"
                  title="Edit period"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedPeriodToCopy(period)
                    setIsCopyModalOpen(true)
                  }}
                  className="absolute top-4 right-4 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 text-sm font-medium"
                  title="Copy as base"
                >
                  Copy
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {periods?.length === 0 && (
        <EmptyState
          message="No budget periods yet. Create your first one!"
          action={canManageBudgetData ? { label: "Create Period", onClick: () => setIsModalOpen(true) } : undefined}
        />
      )}
        <CreatePeriodModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      <CopyBudgetPeriodModal
        isOpen={isCopyModalOpen}
        onClose={() => {
          setIsCopyModalOpen(false)
          setSelectedPeriodToCopy(null)
        }}
        sourcePeriod={selectedPeriodToCopy}
      />
      <EditBudgetPeriodModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setSelectedPeriodToEdit(null)
        }}
        period={selectedPeriodToEdit}
      />
    </div>
  )
}