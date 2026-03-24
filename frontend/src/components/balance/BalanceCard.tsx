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
    <div 
      className="bg-surface-container-lowest rounded-xl p-6"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex justify-between items-start mb-6">
        <h3 className="font-headline font-bold text-on-surface text-lg">{balance.currency}</h3>
        <div className="flex space-x-3">
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors font-mono text-[10px] uppercase tracking-wider group"
            title="Edit opening balance"
          >
            <span className="material-symbols-outlined text-sm select-none">edit</span>
            <span>Edit</span>
          </button>
          <button
            onClick={onRecalculate}
            className="flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors font-mono text-[10px] uppercase tracking-wider group"
            title="Recalculate balance"
          >
            <span className="material-symbols-outlined text-sm select-none">refresh</span>
            <span>Recalculate</span>
          </button>
        </div>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-baseline">
          <span className="font-mono text-[9px] uppercase tracking-widest text-outline">Opening:</span>
          <span className="font-mono font-bold text-on-surface">{openingBalance.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="font-mono text-[9px] uppercase tracking-widest text-outline">Income:</span>
          <span className="font-mono font-bold text-positive">+{totalIncome.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-baseline">
          <span className="font-mono text-[9px] uppercase tracking-widest text-outline">Expenses:</span>
          <span className="font-mono font-bold text-negative">-{totalExpenses.toFixed(2)}</span>
        </div>

        {exchangesIn > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="font-mono text-[9px] uppercase tracking-widest text-outline">Exchanges in:</span>
            <span className="font-mono font-bold text-primary">+{exchangesIn.toFixed(2)}</span>
          </div>
        )}

        {exchangesOut > 0 && (
          <div className="flex justify-between items-baseline">
            <span className="font-mono text-[9px] uppercase tracking-widest text-outline">Exchanges out:</span>
            <span className="font-mono font-bold text-primary">-{exchangesOut.toFixed(2)}</span>
          </div>
        )}

        <div className="pt-3 mt-4 flex justify-between items-baseline">
          <span className="font-mono text-[9px] uppercase tracking-widest text-on-surface font-bold">Closing:</span>
          <span className={`font-mono font-bold text-lg ${closingBalance >= 0 ? 'text-positive' : 'text-negative'}`}>
            {closingBalance.toFixed(2)}
          </span>
        </div>
      </div>

      {balance.last_calculated_at && (
        <p className="font-mono text-[9px] text-outline mt-4">
          Last calculated: {new Date(balance.last_calculated_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}
