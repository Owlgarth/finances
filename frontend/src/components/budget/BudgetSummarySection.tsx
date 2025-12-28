import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../../api/client'
import BudgetTable from './BudgetTable'

interface CategoryBudget {
  id: number
  category_id: number
  category: string
  currency: string
  budget: number
  actual: number
  difference: number
}

interface Props {
  periodId: number
  onEdit?: (budget: CategoryBudget) => void
  onDelete?: (id: number) => void
}

export default function BudgetSummarySection({ periodId, onEdit, onDelete }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['budget-summary', periodId],
    queryFn: async () => {
      const response = await reportsApi.budgetSummary(periodId)
      return response.data
    }
  })

  if (isLoading) return <div>Loading budget summary...</div>

  const currencies = data?.currencies || {}

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Budget vs Actual</h2>

      {Object.keys(currencies).length === 0 && (
        <p className="text-gray-500">No budgets set for this period.</p>
      )}

      {Object.entries(currencies).map(([currency, data]: [string, any]) => (
        <BudgetTable
          key={currency}
          currency={currency}
          categories={data.categories}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}