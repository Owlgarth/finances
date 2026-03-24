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
        <h1 className="font-headline font-extrabold tracking-tight text-3xl text-on-surface">Budget Periods</h1>
        {canManageBudgetData && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-6 py-2.5 rounded-lg hover:opacity-90 transition-all font-medium"
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
            className="bg-surface-container-lowest p-4 sm:p-6 md:p-8 rounded-xl transition-all relative group cursor-pointer"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <h2 className="font-headline font-semibold text-lg mb-3 text-on-surface">{period.name}</h2>
            <p className="text-on-surface-variant text-sm mb-1 font-mono">
              {period.start_date} - {period.end_date}
            </p>
            {period.weeks && (
              <p className="text-outline text-sm font-mono">{period.weeks} weeks</p>
            )}
            {canManageBudgetData && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedPeriodToEdit(period)
                    setIsEditModalOpen(true)
                  }}
                  className="absolute top-4 right-20 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-surface-container-high text-on-surface px-3 py-1.5 rounded-lg hover:bg-surface-container text-sm font-medium"
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
                  className="absolute top-4 right-4 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-gradient-to-br from-primary to-primary-dim text-on-primary px-3 py-1.5 rounded-lg hover:opacity-90 text-sm font-medium"
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