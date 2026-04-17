import { ChevronDown } from 'lucide-react'
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
    <div className="bg-surface rounded-sm overflow-hidden border border-border">
      {/* Desktop Table */}
      <div className={isCardsView ? 'hidden' : 'hidden md:block overflow-x-auto'}>
        <table className="w-full">
        <thead>
          <tr className="bg-surface-muted">
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">
              <button
                onClick={onToggleDateSort}
                className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer group uppercase"
              >
                Date
                <ChevronDown size={12} className={`transition-transform ${isDesc ? '' : 'rotate-180'} select-none`} />
              </button>
            </th>
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Description</th>
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Category</th>
            <th className="px-6 py-2 text-right font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Amount</th>
            <th className="px-6 py-2 text-center font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Currency</th>
            <th className="px-6 py-2 text-left font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Type</th>
            {(onEdit || onDelete) && (
              <th className="px-6 py-2 text-center font-mono text-[9px] font-bold text-text-muted uppercase tracking-widest">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {transactions.map(transaction => (
            <tr
              key={transaction.id}
              className="hover:bg-surface-hover transition-colors"
            >
              <td className="px-6 py-3 font-mono text-sm text-text-muted">{transaction.date}</td>
              <td className="px-6 py-3 text-sm font-medium text-text">{transaction.description}</td>
              <td className="px-6 py-3 text-sm text-text-muted">{transaction.category?.name || '-'}</td>
              <td className="px-6 py-3 text-right">
                <span className={`font-mono font-bold ${
                  transaction.type === 'income' ? 'text-positive' : 'text-negative'
                }`}>
                  {transaction.type === 'income' ? '+' : '-'}
                  {Number(Math.abs(transaction.amount)).toFixed(2)}
                </span>
              </td>
              <td className="px-6 py-3 text-center">
                <span className="font-mono text-sm font-bold text-text-muted">
                  {transaction.currency}
                </span>
              </td>
              <td className="px-6 py-3">
                <span className={`px-3 py-0.5 rounded-sm border font-mono text-[10px] font-bold uppercase tracking-wider select-none ${
                  transaction.type === 'income'
                    ? 'bg-positive-bg text-positive border-positive/20'
                    : 'bg-negative-bg text-negative border-negative/20'
                }`}>
                  {transaction.type}
                </span>
              </td>
              {(onEdit || onDelete) && (
                <td className="px-6 py-3 text-center">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(transaction)}
                      className="text-text-muted hover:text-primary mr-4 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(transaction.id)}
                      className="text-negative hover:text-negative font-mono text-[10px] font-bold uppercase tracking-wider transition-colors"
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
              className="p-4 bg-surface-muted rounded-sm hover:bg-surface-hover transition-colors border border-border"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="font-sans font-bold text-text">{transaction.description}</h4>
                  <p className="text-sm text-text-muted mt-1">{transaction.category?.name || 'No category'}</p>
                </div>
                <span className={`font-mono font-bold text-lg ml-3 ${
                  transaction.type === 'income' ? 'text-positive' : 'text-negative'
                }`}>
                  {transaction.type === 'income' ? '+' : '-'}
                  {Number(Math.abs(transaction.amount)).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center mb-4">
                <span className="font-mono text-sm text-text-muted">{transaction.date}</span>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm text-text-muted">{transaction.currency}</span>
                  <span className={`px-2 py-0.5 rounded-sm border font-mono text-[10px] font-bold uppercase tracking-wider select-none ${
                    transaction.type === 'income'
                      ? 'bg-positive-bg text-positive border-positive/20'
                      : 'bg-negative-bg text-negative border-negative/20'
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
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-text bg-surface-hover rounded-sm hover:bg-surface-muted transition-colors border border-border"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(transaction.id)}
                      className="flex-1 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-negative bg-negative-bg rounded-sm hover:bg-negative-bg transition-colors border border-negative/20"
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
        <p className="text-center py-8 text-text-muted font-sans">No transactions yet</p>
      )}
    </div>
  )
}
