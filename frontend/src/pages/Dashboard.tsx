import {useState} from 'react'
import {useMutation, useQueryClient} from '@tanstack/react-query'
import {useNavigate} from 'react-router-dom'
import toast from 'react-hot-toast'
import {budgetsApi} from '../api/client'
import {useBudgetPeriod} from '../contexts/BudgetPeriodContext'
import {usePermissions} from '../hooks/usePermissions'
import CreateBudgetModal from '../components/modals/budget/CreateBudgetModal'
import EditBudgetModal from '../components/modals/budget/EditBudgetModal'
import Loading from '../components/common/Loading'
import EmptyState from '../components/common/EmptyState'
import BalanceSection from '../components/balance/BalanceSection'
import BudgetSummarySection from '../components/budget/BudgetSummarySection'

interface CategoryBudget {
  id: number
  category_id: number
  category: string
  currency: string
  budget: number
  actual: number
  difference: number
}

export default function Dashboard() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false)
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [selectedBudget, setSelectedBudget] = useState<CategoryBudget | null>(null)

    const {selectedPeriod: period, isLoading} = useBudgetPeriod()
    const {canManageBudgetData} = usePermissions()

    const deleteMutation = useMutation({
        mutationFn: (id: number) => budgetsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budget-summary', period?.id] })
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

    if (isLoading) return <Loading/>

    if (!period) {
        return (
            <EmptyState
                message="No active budget period found for today's date."
                action={{label: "View All Periods", onClick: () => navigate('/budget-periods')}}
            />
        )
    }

    return (
        <div className="max-w-screen-2xl mx-auto">
            <BalanceSection periodId={period.id}/>

            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 mt-8 sm:mt-12">
                <h2 className="text-2xl font-semibold text-gray-900">Budget vs Actual</h2>
                {canManageBudgetData && (
                    <button
                        onClick={() => setIsBudgetModalOpen(true)}
                        className="bg-gray-900 text-white px-6 py-2.5 rounded-lg hover:bg-gray-800 transition-colors font-medium"
                    >
                        Add Budget
                    </button>
                )}
            </div>

            <BudgetSummarySection
                periodId={period.id}
                onEdit={canManageBudgetData ? handleEdit : undefined}
                onDelete={canManageBudgetData ? handleDelete : undefined}
            />

            <CreateBudgetModal
                isOpen={isBudgetModalOpen}
                onClose={() => setIsBudgetModalOpen(false)}
                periodId={period.id}
            />

            <EditBudgetModal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false)
                    setSelectedBudget(null)
                }}
                budget={selectedBudget}
                periodId={period.id}
            />
        </div>
    )
}