import { Pencil, RefreshCw } from 'lucide-react'
import type { PeriodBalance } from '../../../types'
import Modal from '../../common/Modal'

interface Props {
  isOpen: boolean
  onClose: () => void
  balance: PeriodBalance | null
  onEdit: (balance: PeriodBalance) => void
  onRecalculate: (currency: string) => void
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function closingColorClass(value: number): string {
  if (value > 0) return 'text-positive'
  if (value < 0) return 'text-negative'
  return 'text-text-muted'
}

export default function BalanceDetailModal({ isOpen, onClose, balance, onEdit, onRecalculate }: Props) {
  if (!isOpen || !balance) return null

  const opening = Number(balance.opening_balance) || 0
  const income = Number(balance.total_income) || 0
  const expenses = Number(balance.total_expenses) || 0
  const exchIn = Number(balance.exchanges_in) || 0
  const exchOut = Number(balance.exchanges_out) || 0
  const closing = Number(balance.closing_balance) || 0

  const handleEdit = () => {
    onClose()
    onEdit(balance)
  }

  const handleRecalculate = () => {
    onClose()
    onRecalculate(balance.currency)
  }

  return (
    <Modal open={isOpen} onClose={onClose} size="md" className="p-6">
        <h2 className="font-semibold text-text text-sm mb-6">{balance.currency} Balance</h2>

        <div className="space-y-1.5">
          <div className="flex justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Opening</span>
            <span className={`font-mono text-sm font-medium tabular-nums ${opening === 0 ? 'text-text-muted' : 'text-text'}`}>
              {formatAmount(opening)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Income</span>
            <span className={`font-mono text-sm font-medium tabular-nums ${income === 0 ? 'text-text-muted' : 'text-positive'}`}>
              +{formatAmount(income)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Expenses</span>
            <span className={`font-mono text-sm font-medium tabular-nums ${expenses === 0 ? 'text-text-muted' : 'text-negative'}`}>
              -{formatAmount(expenses)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Exchange In</span>
            <span className={`font-mono text-sm font-medium tabular-nums ${exchIn === 0 ? 'text-text-muted' : 'text-text'}`}>
              {exchIn === 0 ? formatAmount(0) : `+${formatAmount(exchIn)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">Exchange Out</span>
            <span className={`font-mono text-sm font-medium tabular-nums ${exchOut === 0 ? 'text-text-muted' : 'text-text'}`}>
              {exchOut === 0 ? formatAmount(0) : `-${formatAmount(exchOut)}`}
            </span>
          </div>
        </div>

        <div className="h-px bg-border my-3" />

        <div className="flex justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted font-medium">Closing</span>
          <span className={`font-mono text-base font-medium tabular-nums ${closingColorClass(closing)}`}>
            {formatAmount(closing)}
          </span>
        </div>

        {balance.last_calculated_at && (
          <div className="mt-3">
            <span className="font-mono text-[10px] text-text-muted">
              Last calculated: {new Date(balance.last_calculated_at).toLocaleString()}
            </span>
          </div>
        )}

        <div className="flex justify-end space-x-3 mt-6">
          <button
            type="button"
            onClick={handleRecalculate}
            className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm hover:bg-surface-hover transition-colors text-xs font-medium flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            Recalculate
          </button>
          <button
            type="button"
            onClick={handleEdit}
            className="bg-primary text-white px-3 py-1.5 rounded-sm hover:bg-primary-hover transition-colors text-xs font-medium flex items-center gap-1.5"
          >
            <Pencil size={12} />
            Edit Opening Balance
          </button>
        </div>
    </Modal>
  )
}
