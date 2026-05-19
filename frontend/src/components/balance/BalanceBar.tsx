import type { PeriodBalance } from '../../types'

interface Props {
  balances: PeriodBalance[]
  onSelect: (balance: PeriodBalance) => void
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

function closingBorderClass(value: number): string {
  if (value > 0) return 'border-t-positive'
  if (value < 0) return 'border-t-negative'
  return 'border-t-border'
}

export default function BalanceBar({ balances, onSelect }: Props) {
  if (balances.length === 0) return null

  return (
    <>
      {/* Mobile: list layout (<md) */}
      <div className="md:hidden border border-border rounded-sm overflow-hidden">
        {balances.map((balance, index) => {
          const closing = Number(balance.closing_balance) || 0
          const isLast = index === balances.length - 1

          return (
            <button
              key={balance.id}
              type="button"
              onClick={() => onSelect(balance)}
              className={`w-full flex items-center justify-between h-10 px-4 bg-surface hover:bg-surface-hover transition-colors cursor-pointer text-left ${isLast ? '' : 'border-b border-border'}`}
            >
              <span className="font-mono text-sm font-medium text-text">
                {balance.currency}
              </span>
              <span className={`font-mono text-base font-medium tabular-nums ${closingColorClass(closing)}`}>
                {formatAmount(closing)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Desktop: horizontal card row (≥md) */}
      <div className="hidden md:flex flex-wrap gap-3">
        {balances.map((balance) => {
          const closing = Number(balance.closing_balance) || 0

          return (
            <button
              key={balance.id}
              type="button"
              onClick={() => onSelect(balance)}
              className={`border border-border border-t-2 rounded-sm bg-surface hover:bg-surface-hover transition-colors cursor-pointer text-center p-4 min-w-[140px] ${closingBorderClass(closing)}`}
            >
              <div className="font-mono text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                {balance.currency}
              </div>
              <div className={`font-mono text-lg font-medium tabular-nums ${closingColorClass(closing)}`}>
                {formatAmount(closing)}
              </div>
            </button>
          )
        })}
      </div>
    </>
  )
}
