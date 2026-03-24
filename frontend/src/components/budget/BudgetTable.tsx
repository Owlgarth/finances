import BudgetCategoryRow from './BudgetCategoryRow'
import { useLayout } from '../../contexts/LayoutContext'

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
  const { isCardsView } = useLayout()
  const totalBudget = categories.reduce((sum, c) => sum + Number(c.budget), 0)
  const totalActual = categories.reduce((sum, c) => sum + Number(c.actual), 0)
  const totalDifference = totalBudget - totalActual

  return (
    <div 
      className="bg-surface-container-lowest rounded-xl overflow-hidden mb-8"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="px-4 sm:px-6 py-4">
        <h3 className="font-headline font-bold text-on-surface">Budget {currency}</h3>
      </div>

      {/* Desktop Table */}
      <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
        <table className="w-full">
        <thead>
          <tr className="bg-surface-container-low">
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Category</th>
            <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Budget</th>
            <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Actual</th>
            <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Difference</th>
            <th className="px-6 py-2 font-mono text-[9px] font-bold text-outline uppercase tracking-widest text-center">Progress</th>
            {(onEdit || onDelete) && (
              <th className="px-6 py-2 text-center font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Actions</th>
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
          <tr className="bg-surface-container-low">
            <td className="px-6 py-4 font-mono font-bold text-on-surface">Total</td>
            <td className="px-6 py-4 text-right font-mono font-bold text-on-surface">{totalBudget.toFixed(2)}</td>
            <td className="px-6 py-4 text-right font-mono font-bold text-on-surface">{totalActual.toFixed(2)}</td>
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
      <div className={isCardsView ? '' : 'md:hidden'}>
        {categories.map(cat => {
          const budgetNum = Number(cat.budget) || 0
          const actualNum = Number(cat.actual) || 0
          const difference = budgetNum - actualNum
          const percentage = budgetNum > 0 ? (actualNum / budgetNum) * 100 : 0
          const isOverBudget = actualNum > budgetNum

          return (
            <div key={cat.category} className={`p-4 ${isOverBudget ? 'bg-[rgba(225,29,72,0.04)]' : ''}`}>
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-headline font-bold text-on-surface">{cat.category}</h4>
                <span className={`font-mono font-bold ${isOverBudget ? 'text-negative' : 'text-positive'}`}>
                  {difference.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3 text-sm font-mono">
                <div>
                  <span className="text-on-surface-variant text-[10px] uppercase tracking-wider">Budget:</span>
                  <span className="ml-1 font-bold text-on-surface">{budgetNum.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-on-surface-variant text-[10px] uppercase tracking-wider">Actual:</span>
                  <span className="ml-1 font-bold text-on-surface">{actualNum.toFixed(2)}</span>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-surface-container-high rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full ${percentage >= 75 ? 'bg-negative' : 'bg-primary'}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[9px] text-outline w-10 text-right select-none">{percentage.toFixed(0)}%</span>
                </div>
              </div>

              {(onEdit || onDelete) && (
                <div className="flex space-x-2">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(cat)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-on-surface bg-surface-container-high rounded hover:bg-surface-container transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(cat.id)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-negative bg-[rgba(225,29,72,0.08)] rounded hover:bg-[rgba(225,29,72,0.12)] transition-colors"
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
        <div className="p-4 bg-surface-container-low font-bold">
          <div className="flex justify-between items-center mb-2">
            <span className="text-on-surface font-headline uppercase tracking-tight text-sm select-none">Total</span>
            <span className={`font-mono ${totalDifference < 0 ? 'text-negative' : 'text-positive'}`}>
              {totalDifference.toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm font-mono">
            <div>
              <span className="text-on-surface-variant text-[10px] uppercase tracking-wider select-none">Budget:</span>
              <span className="ml-1 text-on-surface">{totalBudget.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-on-surface-variant text-[10px] uppercase tracking-wider select-none">Actual:</span>
              <span className="ml-1 text-on-surface">{totalActual.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
