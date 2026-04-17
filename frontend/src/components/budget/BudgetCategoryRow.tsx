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

  return (
    <tr className={`hover:bg-surface-hover transition-colors h-8 ${percentage >= 100 ? 'bg-negative-bg' : ''}`}>
      <td className="px-6 py-2 text-sm font-medium text-text">{categoryBudget.category}</td>
      <td className="px-6 py-2 text-right font-mono text-sm font-bold text-text">{budgetNum.toFixed(2)}</td>
      <td className="px-6 py-2 text-right font-mono text-sm font-bold text-text">{actualNum.toFixed(2)}</td>
      <td className="px-6 py-2 text-right">
        <span className={`font-mono text-sm font-bold ${difference < 0 ? 'text-negative' : 'text-positive'}`}>
          {difference.toFixed(2)}
        </span>
      </td>
      <td className="px-6 py-2">
        <div className="flex items-center space-x-3">
          <div className="flex-1 bg-surface-muted rounded-none h-1.5">
            <div
              className={`h-1.5 rounded-none ${percentage >= 75 ? 'bg-negative' : 'bg-primary'}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <span className="font-mono text-[9px] text-text-muted w-10 text-right select-none">{percentage.toFixed(0)}%</span>
        </div>
      </td>
      {(onEdit || onDelete) && (
        <td className="px-6 py-2 text-center">
          {onEdit && (
            <button
              onClick={() => onEdit(categoryBudget)}
              className="text-text-muted hover:text-text mr-4 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(categoryBudget.id)}
              className="text-negative hover:text-negative/80 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
            >
              Delete
            </button>
          )}
        </td>
      )}
    </tr>
  )
}
