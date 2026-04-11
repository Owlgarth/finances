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
    const base = "px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider select-none";
    switch (status) {
      case 'done':
        return `${base} bg-tertiary-container text-on-tertiary-container`;
      case 'pending':
        return `${base} bg-secondary-container text-on-secondary-container`;
      case 'cancelled':
      case 'error':
        return `${base} bg-error-container text-[#6b1728]`;
      default:
        return `${base} bg-surface-container-high text-on-surface-variant`;
    }
  };

  return (
    <div 
      className="bg-surface-container-lowest rounded-xl overflow-hidden"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {/* Desktop Table */}
      <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
        <table className="w-full">
          <thead>
            <tr className="bg-surface-container-low">
              <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Name</th>
              <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Category</th>
              <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Amount</th>
              <th className="px-6 py-2 text-center font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Currency</th>
              <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Planned Date</th>
              <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Status</th>
              {(onEdit || onExecute || onCancel || onDelete) && (
                <th className="px-6 py-2 text-center font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {transactions.map(planned => (
              <tr
                key={planned.id}
                className="hover:bg-surface-container-low transition-colors"
              >
                <td className="px-6 py-3 text-sm font-medium text-on-surface">{planned.name}</td>
                <td className="px-6 py-3 text-sm text-on-surface-variant">{planned.category?.name || '-'}</td>
                <td className="px-6 py-3 text-right font-mono text-sm font-bold text-on-surface">
                  {Number(planned.amount).toFixed(2)}
                </td>
                <td className="px-6 py-3 text-center">
                  <span className="font-mono text-sm font-bold text-on-surface-variant">
                    {planned.currency}
                  </span>
                </td>
                <td className="px-6 py-3 font-mono text-sm text-on-surface-variant">{planned.planned_date}</td>
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
                        className="text-on-surface-variant hover:text-primary mr-4 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {onExecute && planned.status === 'pending' && (
                      <button
                        onClick={() => onExecute(planned)}
                        className="text-positive hover:text-tertiary mr-4 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        Execute
                      </button>
                    )}
                    {onCancel && planned.status === 'pending' && (
                      <button
                        onClick={() => onCancel(planned)}
                        className="text-outline hover:text-on-surface-variant mr-4 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(planned.id)}
                        className="text-negative hover:text-error font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
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
              className="p-4 bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="font-headline font-bold text-on-surface">{planned.name}</h4>
                  <p className="text-sm text-on-surface-variant mt-1">{planned.category?.name || 'No category'}</p>
                </div>
                <span className="font-mono font-bold text-lg text-on-surface ml-3">
                  {Number(planned.amount).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center mb-4">
                <span className="font-mono text-sm text-on-surface-variant">{planned.planned_date}</span>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm text-on-surface-variant">{planned.currency}</span>
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
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-on-surface bg-surface-container-high rounded hover:bg-surface-container-highest transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onExecute && planned.status === 'pending' && (
                    <button
                      onClick={() => onExecute(planned)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-on-tertiary-container bg-tertiary-container rounded hover:opacity-90 transition-colors"
                    >
                      Execute
                    </button>
                  )}
                  {onCancel && planned.status === 'pending' && (
                    <button
                      onClick={() => onCancel(planned)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-on-surface bg-surface-container-high rounded hover:bg-surface-container-highest transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(planned.id)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-negative bg-[rgba(225,29,72,0.08)] rounded hover:bg-[rgba(225,29,72,0.12)] transition-colors"
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
        <p className="text-center py-8 text-on-surface-variant font-headline">No planned transactions</p>
      )}
    </div>
  )
}
