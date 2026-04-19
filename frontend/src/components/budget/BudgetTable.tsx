import BudgetCategoryRow from './BudgetCategoryRow'

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
  currency: string
  categories: CategoryBudget[]
  onEdit?: (budget: CategoryBudget) => void
  onDelete?: (id: number) => void
}

export default function BudgetTable({ currency, categories, onEdit, onDelete }: Props) {
  const totalBudget = categories.reduce((sum, c) => sum + Number(c.budget), 0)
  const totalActual = categories.reduce((sum, c) => sum + Number(c.actual), 0)
  const totalDifference = totalBudget - totalActual

  return (
    <div className="bg-surface rounded-sm border border-border overflow-hidden mb-8">
      <div className="px-4 sm:px-6 py-4">
        <h3 className="font-sans font-semibold text-text">Budget {currency}</h3>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
        <thead>
          <tr className="bg-surface-hover">
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Category</th>
            <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Budget</th>
            <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Actual</th>
            <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Difference</th>
            <th className="px-6 py-2 font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest text-center">Progress</th>
            {(onEdit || onDelete) && (
              <th className="px-6 py-2 text-center font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {categories.map(cat => (
            <BudgetCategoryRow
              key={cat.category}
              categoryBudget={cat}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          <tr className="bg-surface-hover">
            <td className="px-6 py-4 font-mono font-bold text-text">Total</td>
            <td className="px-6 py-4 text-right font-mono font-bold text-text">{totalBudget.toFixed(2)}</td>
            <td className="px-6 py-4 text-right font-mono font-bold text-text">{totalActual.toFixed(2)}</td>
            <td className="px-6 py-4 text-right">
              <span className={`font-mono font-bold ${totalDifference < 0 ? 'text-negative' : 'text-positive'}`}>
                {totalDifference.toFixed(2)}
              </span>
            </td>
            <td className="px-6 py-4"></td>
            {(onEdit || onDelete) && <td className="px-6 py-4"></td>}
          </tr>
        </tbody>
      </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden">
        {categories.map(cat => {
          const budgetNum = Number(cat.budget) || 0
          const actualNum = Number(cat.actual) || 0
          const difference = budgetNum - actualNum
          const percentage = budgetNum > 0 ? (actualNum / budgetNum) * 100 : 0
          const isOverBudget = actualNum > budgetNum

          return (
            <div key={cat.category} className={`p-4 ${isOverBudget ? 'bg-negative-bg' : ''}`}>
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-sans font-medium text-text">{cat.category}</h4>
                <span className={`font-mono font-bold ${isOverBudget ? 'text-negative' : 'text-positive'}`}>
                  {difference.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3 text-sm font-mono">
                <div>
                  <span className="text-text-muted text-[10px] uppercase tracking-wider">Budget:</span>
                  <span className="ml-1 font-bold text-text">{budgetNum.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-text-muted text-[10px] uppercase tracking-wider">Actual:</span>
                  <span className="ml-1 font-bold text-text">{actualNum.toFixed(2)}</span>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-surface-muted rounded-none h-1.5">
                    <div
                      className={`h-1.5 rounded-none ${percentage >= 75 ? 'bg-negative' : 'bg-primary'}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[9px] text-text-muted w-10 text-right select-none">{percentage.toFixed(0)}%</span>
                </div>
              </div>

              {(onEdit || onDelete) && (
                <div className="flex space-x-2">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(cat)}
                      className="flex-1 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-text bg-surface-hover border border-border rounded-sm hover:bg-surface-muted transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(cat.id)}
                      className="flex-1 px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-negative bg-negative-bg border border-negative/30 rounded-sm hover:bg-negative-bg transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Mobile Total */}
        <div className="p-4 bg-surface-hover font-bold">
          <div className="flex justify-between items-center mb-2">
            <span className="text-text font-sans uppercase tracking-tight text-sm select-none">Total</span>
            <span className={`font-mono ${totalDifference < 0 ? 'text-negative' : 'text-positive'}`}>
              {totalDifference.toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm font-mono">
            <div>
              <span className="text-text-muted text-[10px] uppercase tracking-wider select-none">Budget:</span>
              <span className="ml-1 text-text">{totalBudget.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-text-muted text-[10px] uppercase tracking-wider select-none">Actual:</span>
              <span className="ml-1 text-text">{totalActual.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
