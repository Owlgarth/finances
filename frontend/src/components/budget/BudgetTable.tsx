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
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Budget {currency}</h3>
      </div>

      {/* Desktop Table */}
      <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
        <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Budget</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actual</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Difference</th>
            <th className="px-6 py-4 text-xs font-semibold text-gray-600 uppercase tracking-wider">Progress</th>
            {(onEdit || onDelete) && (
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
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
          <tr className="bg-gray-50 border-t border-gray-200">
            <td className="px-6 py-4 font-semibold text-gray-900">Total</td>
            <td className="px-6 py-4 text-right font-semibold text-gray-900">{totalBudget.toFixed(2)}</td>
            <td className="px-6 py-4 text-right font-semibold text-gray-900">{totalActual.toFixed(2)}</td>
            <td className="px-6 py-4 text-right">
              <span className={`font-semibold ${totalDifference < 0 ? 'text-red-600' : 'text-green-600'}`}>
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
      <div className={isCardsView ? 'divide-y divide-gray-100' : 'md:hidden divide-y divide-gray-100'}>
        {categories.map(cat => {
          const budgetNum = Number(cat.budget) || 0
          const actualNum = Number(cat.actual) || 0
          const difference = budgetNum - actualNum
          const percentage = budgetNum > 0 ? (actualNum / budgetNum) * 100 : 0
          const isOverBudget = actualNum > budgetNum

          return (
            <div key={cat.category} className={`p-4 ${isOverBudget ? 'bg-red-50' : ''}`}>
              <div className="flex justify-between items-start mb-3">
                <h4 className="font-semibold text-gray-900">{cat.category}</h4>
                <span className={`text-sm font-semibold ${isOverBudget ? 'text-red-600' : 'text-green-600'}`}>
                  {difference.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                <div>
                  <span className="text-gray-600">Budget:</span>
                  <span className="ml-1 font-medium">{budgetNum.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Actual:</span>
                  <span className="ml-1 font-medium">{actualNum.toFixed(2)}</span>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${isOverBudget ? 'bg-red-600' : 'bg-green-600'}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 font-medium">{percentage.toFixed(0)}%</span>
                </div>
              </div>

              {(onEdit || onDelete) && (
                <div className="flex space-x-2">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(cat)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(cat.id)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"
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
        <div className="p-4 bg-gray-50 font-semibold">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-900">Total</span>
            <span className={totalDifference < 0 ? 'text-red-600' : 'text-green-600'}>
              {totalDifference.toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600">Budget:</span>
              <span className="ml-1">{totalBudget.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">Actual:</span>
              <span className="ml-1">{totalActual.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
