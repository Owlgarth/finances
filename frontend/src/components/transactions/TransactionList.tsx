import type { Transaction } from '../../types'
import { useLayout } from '../../contexts/LayoutContext'

type DateOrdering = 'date' | '-date'

interface Props {
  transactions: Transaction[]
  dateOrdering: DateOrdering
  onToggleDateSort: () => void
  onEdit?: (transaction: Transaction) => void
  onDelete?: (id: number) => void
}

export default function TransactionList({ transactions, dateOrdering, onToggleDateSort, onEdit, onDelete }: Props) {
  const { isCardsView } = useLayout()
  const isDesc = dateOrdering === '-date'

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
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">
              <button
                onClick={onToggleDateSort}
                className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer group uppercase"
              >
                Date
                <span className={`material-symbols-outlined text-sm transition-transform ${isDesc ? '' : 'rotate-180'} select-none`}>
                  expand_more
                </span>
              </button>
            </th>
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Description</th>
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Category</th>
            <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Amount</th>
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Type</th>
            {(onEdit || onDelete) && (
              <th className="px-6 py-2 text-center font-mono text-[9px] font-bold text-outline uppercase tracking-widest">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {transactions.map(transaction => (
            <tr
              key={transaction.id}
              className="hover:bg-surface-container-low transition-colors"
            >
              <td className="px-6 py-3 font-mono text-sm text-on-surface-variant">{transaction.date}</td>
              <td className="px-6 py-3 text-sm font-medium text-on-surface">{transaction.description}</td>
              <td className="px-6 py-3 text-sm text-on-surface-variant">{transaction.category?.name || '-'}</td>
              <td className="px-6 py-3 text-right">
                <span className={`font-mono font-bold ${
                  transaction.type === 'income' ? 'text-positive' : 'text-negative'
                }`}>
                  {transaction.type === 'income' ? '+' : '-'}
                  {Number(Math.abs(transaction.amount)).toFixed(2)} {transaction.currency}
                </span>
              </td>
              <td className="px-6 py-3">
                <span className={`px-3 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider select-none ${
                  transaction.type === 'income'
                    ? 'bg-[#d1fae5] text-[#065f46]'
                    : 'bg-error-container text-[#6b1728]'
                }`}>
                  {transaction.type}
                </span>
              </td>
              {(onEdit || onDelete) && (
                <td className="px-6 py-3 text-center">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(transaction)}
                      className="text-on-surface-variant hover:text-primary mr-4 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(transaction.id)}
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
        {transactions.map(transaction => (
            <div
              key={transaction.id}
              className="p-4 bg-surface-container rounded-lg hover:bg-surface-container-high transition-colors"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="font-headline font-bold text-on-surface">{transaction.description}</h4>
                  <p className="text-sm text-on-surface-variant mt-1">{transaction.category?.name || 'No category'}</p>
                </div>
                <span className={`font-mono font-bold text-lg ml-3 ${
                  transaction.type === 'income' ? 'text-positive' : 'text-negative'
                }`}>
                  {transaction.type === 'income' ? '+' : '-'}
                  {Number(Math.abs(transaction.amount)).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center mb-4">
                <span className="font-mono text-sm text-on-surface-variant">{transaction.date}</span>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm text-on-surface-variant">{transaction.currency}</span>
                  <span className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider select-none ${
                    transaction.type === 'income'
                      ? 'bg-[#d1fae5] text-[#065f46]'
                      : 'bg-error-container text-[#6b1728]'
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
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-on-surface bg-surface-container-high rounded hover:bg-surface-container-highest transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(transaction.id)}
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
        <p className="text-center py-8 text-on-surface-variant font-headline">No transactions yet</p>
      )}
    </div>
  )
}
