import type { PlannedTransaction } from '../../types'
import { isOfflineItem } from '../../utils/optimisticUpdates'
import { useLayout } from '../../contexts/LayoutContext'

interface Props {
  transactions: PlannedTransaction[]
  onEdit?: (transaction: PlannedTransaction) => void
  onExecute?: (id: number) => void
  onCancel?: (transaction: PlannedTransaction) => void
  onDelete?: (id: number) => void
}

export default function PlannedTransactionList({ transactions, onEdit, onExecute, onCancel, onDelete }: Props) {
  const { isCardsView } = useLayout()

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Desktop Table */}
      <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Planned Date</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
              {(onEdit || onExecute || onCancel || onDelete) && (
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {transactions.map(planned => {
              const offline = isOfflineItem(planned);
              return (
              <tr
                key={planned.id}
                className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${
                  offline ? 'bg-gray-50 opacity-60' : ''
                }`}
              >
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{planned.name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{planned.category?.name || '-'}</td>
                <td className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                  {Number(planned.amount).toFixed(2)} {planned.currency}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{planned.planned_date}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    planned.status === 'done'
                      ? 'bg-green-50 text-green-700'
                      : planned.status === 'pending'
                      ? 'bg-yellow-50 text-yellow-700'
                      : planned.status === 'cancelled'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-gray-50 text-gray-700'
                  }`}>
                    {planned.status}
                  </span>
                </td>
                {(onEdit || onExecute || onCancel || onDelete) && (
                  <td className="px-6 py-4 text-center">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(planned)}
                        className="text-gray-600 hover:text-gray-900 mr-4 text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {onExecute && planned.status === 'pending' && (
                      <button
                        onClick={() => onExecute(planned.id)}
                        className="text-green-600 hover:text-green-700 mr-4 text-sm font-medium transition-colors"
                      >
                        Mark Done
                      </button>
                    )}
                    {onCancel && planned.status === 'pending' && (
                      <button
                        onClick={() => onCancel(planned)}
                        className="text-orange-600 hover:text-orange-700 mr-4 text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(planned.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className={isCardsView ? 'divide-y divide-gray-100' : 'md:hidden divide-y divide-gray-100'}>
        {transactions.map(planned => {
          const offline = isOfflineItem(planned);
          return (
            <div
              key={planned.id}
              className={`p-4 ${offline ? 'bg-gray-50 opacity-60' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{planned.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{planned.category?.name || 'No category'}</p>
                </div>
                <span className="text-lg font-bold text-gray-900 ml-3">
                  {Number(planned.amount).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">{planned.planned_date}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">{planned.currency}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    planned.status === 'done'
                      ? 'bg-green-50 text-green-700'
                      : planned.status === 'pending'
                      ? 'bg-yellow-50 text-yellow-700'
                      : planned.status === 'cancelled'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-gray-50 text-gray-700'
                  }`}>
                    {planned.status}
                  </span>
                </div>
              </div>

              {(onEdit || onExecute || onCancel || onDelete) && (
                <div className="flex space-x-2">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(planned)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                    >
                      Edit
                    </button>
                  )}
                  {onExecute && planned.status === 'pending' && (
                    <button
                      onClick={() => onExecute(planned.id)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded hover:bg-green-100"
                    >
                      Mark Done
                    </button>
                  )}
                  {onCancel && planned.status === 'pending' && (
                    <button
                      onClick={() => onCancel(planned)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-orange-600 bg-orange-50 rounded hover:bg-orange-100"
                    >
                      Cancel
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(planned.id)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {transactions.length === 0 && (
        <p className="text-center py-8 text-gray-500">No planned transactions</p>
      )}
    </div>
  )
}
