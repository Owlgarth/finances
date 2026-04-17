import type { PlannedTransaction } from '../../types'
import { useLayout } from '../../contexts/LayoutContext'

interface Props {
  transactions: PlannedTransaction[]
  onEdit?: (transaction: PlannedTransaction) => void
  onExecute?: (planned: PlannedTransaction) => void
  onCancel?: (transaction: PlannedTransaction) => void
  onDelete?: (id: number) => void
}

export default function PlannedTransactionList({ transactions, onEdit, onExecute, onCancel, onDelete }: Props) {
  const { isCardsView } = useLayout()

  const getStatusChipClass = (status: string) => {
    const base = "px-3 py-0.5 rounded-sm border font-mono text-[10px] font-medium uppercase tracking-wider select-none";
    switch (status) {
      case 'done':
        return `${base} bg-positive-bg text-positive border-positive/30`;
      case 'pending':
        return `${base} bg-surface-hover text-text border-border`;
      case 'cancelled':
      case 'error':
        return `${base} bg-negative-bg text-negative border-negative/30`;
      default:
        return `${base} bg-surface-hover text-text-muted border-border`;
    }
  };

  return (
    <div className="bg-surface rounded-sm border border-border overflow-hidden">
      {/* Desktop Table */}
      <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
        <table className="w-full">
          <thead>
            <tr className="bg-surface-muted">
              <th className="px-6 py-2 text-left font-mono text-[9px] font-medium text-text-muted uppercase tracking-widest">Name</th>
              <th className="px-6 py-2 text-left font-mono text-[9px] font-medium text-text-muted uppercase tracking-widest">Category</th>
              <th className="px-6 py-2 text-right font-mono text-[9px] font-medium text-text-muted uppercase tracking-widest">Amount</th>
              <th className="px-6 py-2 text-center font-mono text-[9px] font-medium text-text-muted uppercase tracking-widest">Currency</th>
              <th className="px-6 py-2 text-left font-mono text-[9px] font-medium text-text-muted uppercase tracking-widest">Planned Date</th>
              <th className="px-6 py-2 text-left font-mono text-[9px] font-medium text-text-muted uppercase tracking-widest">Status</th>
              {(onEdit || onExecute || onCancel || onDelete) && (
                <th className="px-6 py-2 text-center font-mono text-[9px] font-medium text-text-muted uppercase tracking-widest">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {transactions.map(planned => (
              <tr
                key={planned.id}
                className="hover:bg-surface-hover transition-colors"
              >
                <td className="px-6 py-3 text-sm font-medium text-text">{planned.name}</td>
                <td className="px-6 py-3 text-sm text-text-muted">{planned.category?.name || '-'}</td>
                <td className="px-6 py-3 text-right font-mono text-sm font-medium text-text">
                  {Number(planned.amount).toFixed(2)}
                </td>
                <td className="px-6 py-3 text-center">
                  <span className="font-mono text-sm font-medium text-text-muted">
                    {planned.currency}
                  </span>
                </td>
                <td className="px-6 py-3 font-mono text-sm text-text-muted">{planned.planned_date}</td>
                <td className="px-6 py-3">
                  <span className={getStatusChipClass(planned.status)}>
                    {planned.status}
                  </span>
                </td>
                {(onEdit || onExecute || onCancel || onDelete) && (
                  <td className="px-6 py-3 text-center">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(planned)}
                        className="text-text-muted hover:text-text mr-4 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {onExecute && planned.status === 'pending' && (
                      <button
                        onClick={() => onExecute(planned)}
                        className="text-positive hover:text-positive mr-4 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors"
                      >
                        Execute
                      </button>
                    )}
                    {onCancel && planned.status === 'pending' && (
                      <button
                        onClick={() => onCancel(planned)}
                        className="text-text-muted hover:text-text mr-4 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(planned.id)}
                        className="text-negative hover:text-negative font-mono text-[10px] font-medium uppercase tracking-wider transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className={isCardsView ? 'p-2 space-y-2' : 'md:hidden p-2 space-y-2'}>
        {transactions.map(planned => (
            <div
              key={planned.id}
              className="p-4 bg-surface-muted rounded-sm hover:bg-surface-hover transition-colors border border-border"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="font-sans font-semibold text-text">{planned.name}</h4>
                  <p className="text-sm text-text-muted mt-1">{planned.category?.name || 'No category'}</p>
                </div>
                <span className="font-mono font-medium text-lg text-text ml-3">
                  {Number(planned.amount).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center mb-4">
                <span className="font-mono text-sm text-text-muted">{planned.planned_date}</span>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm text-text-muted">{planned.currency}</span>
                  <span className={getStatusChipClass(planned.status)}>
                    {planned.status}
                  </span>
                </div>
              </div>

              {(onEdit || onExecute || onCancel || onDelete) && (
                <div className="flex space-x-2">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(planned)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-medium uppercase tracking-wider text-text bg-surface-hover rounded-sm border border-border hover:bg-surface-muted transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onExecute && planned.status === 'pending' && (
                    <button
                      onClick={() => onExecute(planned)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-medium uppercase tracking-wider text-positive bg-positive-bg rounded-sm border border-positive/30 hover:bg-positive-bg transition-colors"
                    >
                      Execute
                    </button>
                  )}
                  {onCancel && planned.status === 'pending' && (
                    <button
                      onClick={() => onCancel(planned)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-medium uppercase tracking-wider text-text bg-surface-hover rounded-sm border border-border hover:bg-surface-muted transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(planned.id)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-medium uppercase tracking-wider text-negative bg-negative-bg rounded-sm border border-negative/30 hover:bg-negative-bg transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
        ))}
      </div>

      {transactions.length === 0 && (
        <p className="text-center py-8 text-text-muted">No planned transactions</p>
      )}
    </div>
  )
}
