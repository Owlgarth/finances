import SortableTh from '../common/SortableTh'
import type { CurrencyExchange } from '../../types'

interface Props {
  exchanges: CurrencyExchange[]
  ordering: string
  onSort: (field: string) => void
  canManageBudgetData: boolean
  onEdit?: (exchange: CurrencyExchange) => void
  onDelete?: (id: number) => void
}

export default function CurrencyExchangeList({ exchanges, ordering, onSort, canManageBudgetData, onEdit, onDelete }: Props) {
  const activeField = ordering.replace(/^-/, '')
  const isDescending = ordering.startsWith('-')

  return (
    <div className="bg-surface border border-border rounded-sm overflow-hidden">
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-hover">
            <tr>
              <SortableTh label="Date" field="date" activeField={activeField} isDescending={isDescending} onSort={onSort} align="left" />
              <SortableTh label="Description" field="description" activeField={activeField} isDescending={isDescending} onSort={onSort} align="left" />
              <SortableTh label="From" field="from_amount" activeField={activeField} isDescending={isDescending} onSort={onSort} align="right" />
              <th className="px-6 py-2 text-center font-mono text-[9px] uppercase tracking-widest text-text-muted">→</th>
              <SortableTh label="To" field="to_amount" activeField={activeField} isDescending={isDescending} onSort={onSort} align="right" />
              <SortableTh label="Rate" field="exchange_rate" activeField={activeField} isDescending={isDescending} onSort={onSort} align="right" />
              {canManageBudgetData && (
                <th className="px-6 py-2 text-center font-mono text-[9px] uppercase tracking-widest text-text-muted">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {exchanges.map(exchange => (
              <tr key={exchange.id} className="hover:bg-surface-hover transition-colors">
                <td className="px-6 py-4 text-sm text-text-muted font-mono">{exchange.date}</td>
                <td className="px-6 py-4 text-sm text-text">{exchange.description || '-'}</td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-mono font-bold text-negative">
                    -{Number(exchange.from_amount).toFixed(2)} {exchange.from_currency}
                  </span>
                </td>
                <td className="px-6 py-4 text-center text-text-muted">→</td>
                <td className="px-6 py-4 text-right">
                  <span className="text-sm font-mono font-bold text-positive">
                    +{Number(exchange.to_amount).toFixed(2)} {exchange.to_currency}
                  </span>
                </td>
                <td className="px-6 py-4 text-right text-sm text-text-muted font-mono">
                  {exchange.exchange_rate ? Number(exchange.exchange_rate).toFixed(6) : '-'}
                </td>
                {canManageBudgetData && (
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => onEdit?.(exchange)} className="text-text-muted hover:text-text mr-4 text-sm font-medium transition-colors">
                      Edit
                    </button>
                    <button onClick={() => onDelete?.(exchange.id)} className="text-negative hover:opacity-80 text-sm font-medium transition-colors">
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden">
        {exchanges.map(exchange => (
            <div key={exchange.id} className="p-4 hover:bg-surface-hover transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-text">{exchange.description || 'Currency Exchange'}</h4>
                  <p className="text-sm text-text-muted mt-1 font-mono">{exchange.date}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-3 py-2">
                <div className="flex-1">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted block mb-1">From</span>
                  <span className="text-sm font-mono font-bold text-negative">
                    -{Number(exchange.from_amount).toFixed(2)} {exchange.from_currency}
                  </span>
                </div>
                <div className="px-3 text-text-muted">→</div>
                <div className="flex-1 text-right">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted block mb-1">To</span>
                  <span className="text-sm font-mono font-bold text-positive">
                    +{Number(exchange.to_amount).toFixed(2)} {exchange.to_currency}
                  </span>
                </div>
              </div>

              <div className="mb-3">
                <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">Exchange Rate: </span>
                <span className="text-sm font-medium text-text font-mono">
                  {exchange.exchange_rate ? Number(exchange.exchange_rate).toFixed(6) : '-'}
                </span>
              </div>

              {canManageBudgetData && (
                <div className="flex space-x-2">
                  <button onClick={() => onEdit?.(exchange)} className="flex-1 px-3 py-2 text-sm font-medium text-text bg-surface border border-border rounded-sm hover:bg-surface-hover transition-colors">
                    Edit
                  </button>
                  <button onClick={() => onDelete?.(exchange.id)} className="flex-1 px-3 py-2 text-sm font-medium text-white bg-negative rounded-sm hover:opacity-80 transition-colors">
                    Delete
                  </button>
                </div>
              )}
            </div>
        ))}
      </div>

      {exchanges.length === 0 && (
        <p className="text-center py-8 text-text-muted">No currency exchanges yet</p>
      )}
    </div>
  )
}
