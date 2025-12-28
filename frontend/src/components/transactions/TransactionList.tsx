import type { Transaction } from '../../types'
import { isOfflineItem } from '../../utils/optimisticUpdates'
import { useLayout } from '../../contexts/LayoutContext'

interface Props {
  transactions: Transaction[]
  onEdit?: (transaction: Transaction) => void
  onDelete?: (id: number) => void
}

export default function TransactionList({ transactions, onEdit, onDelete }: Props) {
  const { isCardsView } = useLayout()

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Desktop Table */}
      <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
        <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Category</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
            {(onEdit || onDelete) && (
              <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {transactions.map(transaction => {
            const offline = isOfflineItem(transaction);
            return (
            <tr
              key={transaction.id}
              className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${
                offline ? 'bg-gray-50 opacity-60' : ''
              }`}
            >
              <td className="px-6 py-4 text-sm text-gray-600">{transaction.date}</td>
              <td className="px-6 py-4 text-sm font-medium text-gray-900">{transaction.description}</td>
              <td className="px-6 py-4 text-sm text-gray-600">{transaction.category?.name || '-'}</td>
              <td className="px-6 py-4 text-right">
                <span className={`text-sm font-semibold ${
                  transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {transaction.type === 'income' ? '+' : '-'}
                  {Number(Math.abs(transaction.amount)).toFixed(2)} {transaction.currency}
                </span>
              </td>
              <td className="px-6 py-4">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  transaction.type === 'income'
                    ? 'bg-green-50 text-green-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {transaction.type}
                </span>
              </td>
              {(onEdit || onDelete) && (
                <td className="px-6 py-4 text-center">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(transaction)}
                      className="text-gray-600 hover:text-gray-900 mr-4 text-sm font-medium transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(transaction.id)}
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
        {transactions.map(transaction => {
          const offline = isOfflineItem(transaction);
          return (
            <div
              key={transaction.id}
              className={`p-4 ${offline ? 'bg-gray-50 opacity-60' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{transaction.description}</h4>
                  <p className="text-sm text-gray-600 mt-1">{transaction.category?.name || 'No category'}</p>
                </div>
                <span className={`text-lg font-bold ml-3 ${
                  transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {transaction.type === 'income' ? '+' : '-'}
                  {Number(Math.abs(transaction.amount)).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center mb-3">
                <span className="text-sm text-gray-500">{transaction.date}</span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">{transaction.currency}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    transaction.type === 'income'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {transaction.type}
                  </span>
                </div>
              </div>

              {(onEdit || onDelete) && (
                <div className="flex space-x-2">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(transaction)}
                      className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(transaction.id)}
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
        <p className="text-center py-8 text-gray-500">No transactions yet</p>
      )}
    </div>
  )
}
