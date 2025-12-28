import type { PeriodBalance } from '../../types'

interface Props {
  balance: PeriodBalance
  onEdit: () => void
  onRecalculate: () => void
}

export default function BalanceCard({ balance, onEdit, onRecalculate }: Props) {
  // Ensure numeric values are properly converted
  const openingBalance = Number(balance.opening_balance) || 0
  const totalIncome = Number(balance.total_income) || 0
  const totalExpenses = Number(balance.total_expenses) || 0
  const exchangesIn = Number(balance.exchanges_in) || 0
  const exchangesOut = Number(balance.exchanges_out) || 0
  const closingBalance = Number(balance.closing_balance) || 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-start mb-6">
        <h3 className="text-lg font-semibold text-gray-900">{balance.currency}</h3>
        <div className="flex space-x-3">
          <button
            onClick={onEdit}
            className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
            title="Edit opening balance"
          >
            ✏️ Edit
          </button>
          <button
            onClick={onRecalculate}
            className="text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
            title="Recalculate balance"
          >
            🔄 Recalculate
          </button>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Opening:</span>
          <span className="font-semibold text-gray-900">{openingBalance.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500">Income:</span>
          <span className="font-semibold text-green-600">+{totalIncome.toFixed(2)}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-500">Expenses:</span>
          <span className="font-semibold text-red-600">-{totalExpenses.toFixed(2)}</span>
        </div>

        {exchangesIn > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Exchanges in:</span>
            <span className="font-semibold text-blue-600">+{exchangesIn.toFixed(2)}</span>
          </div>
        )}

        {exchangesOut > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Exchanges out:</span>
            <span className="font-semibold text-blue-600">-{exchangesOut.toFixed(2)}</span>
          </div>
        )}

        <div className="border-t border-gray-200 pt-3 mt-4 flex justify-between">
          <span className="text-gray-700 font-semibold">Closing:</span>
          <span className={`font-bold text-lg ${closingBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {closingBalance.toFixed(2)}
          </span>
        </div>
      </div>

      {balance.last_calculated_at && (
        <p className="text-xs text-gray-400 mt-3">
          Last calculated: {new Date(balance.last_calculated_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}