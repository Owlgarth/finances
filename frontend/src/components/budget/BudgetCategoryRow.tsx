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
  categoryBudget: CategoryBudget
  onEdit?: (budget: CategoryBudget) => void
  onDelete?: (id: number) => void
}

export default function BudgetCategoryRow({ categoryBudget, onEdit, onDelete }: Props) {
  const budgetNum = Number(categoryBudget.budget) || 0
  const actualNum = Number(categoryBudget.actual) || 0
  const difference = budgetNum - actualNum
  const percentage = budgetNum > 0 ? (actualNum / budgetNum) * 100 : 0
  const isOverBudget = actualNum > budgetNum

  return (
    <tr className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${isOverBudget ? 'bg-red-50' : ''}`}>
      <td className="px-6 py-4 text-sm font-medium text-gray-900">{categoryBudget.category}</td>
      <td className="px-6 py-4 text-right text-sm text-gray-900">{budgetNum.toFixed(2)}</td>
      <td className="px-6 py-4 text-right text-sm text-gray-900">{actualNum.toFixed(2)}</td>
      <td className="px-6 py-4 text-right">
        <span className={`text-sm font-semibold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
          {difference.toFixed(2)}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center space-x-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${isOverBudget ? 'bg-red-600' : 'bg-green-600'}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <span className="text-xs text-gray-600 w-10 text-right font-medium">{percentage.toFixed(0)}%</span>
        </div>
      </td>
      {(onEdit || onDelete) && (
        <td className="px-6 py-4 text-center">
          {onEdit && (
            <button
              onClick={() => onEdit(categoryBudget)}
              className="text-gray-600 hover:text-gray-900 mr-4 text-sm font-medium transition-colors"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(categoryBudget.id)}
              className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
            >
              Delete
            </button>
          )}
        </td>
      )}
    </tr>
  )
}