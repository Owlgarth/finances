import { ArrowRight } from 'lucide-react'
import type { TransactionTotalItem, PlannedTransactionTotalItem, CurrencyExchangeTotalItem } from '../../types'

// ============= Props =============

interface TransactionProps {
  mode: 'transactions'
  typeTotals: TransactionTotalItem[]
  categoryTotals?: TransactionTotalItem[]
}

interface PlannedProps {
  mode: 'planned'
  categoryTotals: PlannedTransactionTotalItem[]
}

interface ExchangeProps {
  mode: 'exchanges'
  totals: CurrencyExchangeTotalItem[]
}

type Props = TransactionProps | PlannedProps | ExchangeProps

// ============= Helpers =============

function formatAmount(total: string): string {
  // String-based formatting to preserve full Decimal precision from backend.
  // Avoids parseFloat which loses precision for large values (e.g. "123456789012345.67").
  const isNegative = total.startsWith('-')
  const abs = isNegative ? total.slice(1) : total
  const [intPart, decPart = '00'] = abs.split('.')
  const paddedDec = decPart.length < 2 ? decPart.padEnd(2, '0') : decPart.slice(0, 2)
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = isNegative ? '-' : ''
  return `${sign}${formattedInt}.${paddedDec}`
}

function extractCurrencies(items: { currency: string }[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    if (!seen.has(item.currency)) {
      seen.add(item.currency)
      result.push(item.currency)
    }
  }
  return result
}

// ============= Sub-renderers =============

function TransactionTable({
  typeTotals,
  categoryTotals,
  currencies,
}: {
  typeTotals: TransactionTotalItem[]
  categoryTotals?: TransactionTotalItem[]
  currencies: string[]
}) {
  const typeMap = new Map(typeTotals.map((t) => [`${t.group}|${t.currency}`, t.total]))

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-text-muted text-xs font-sans border-b border-border">
          <th className="text-left py-2 pr-4 font-normal"></th>
          {currencies.map((c) => (
            <th key={c} className="text-right py-2 px-3 font-normal">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {['income', 'expense'].map((type) => (
          <tr key={type} className={`hover:bg-surface-hover transition-colors ${type === 'income' ? 'text-positive' : 'text-negative'}`}>
            <td className="py-2 pr-4 font-sans capitalize">{type}</td>
            {currencies.map((c) => {
              const val = typeMap.get(`${type}|${c}`)
              return (
                <td key={c} className="py-2 px-3 text-right font-mono">
                  {val != null ? formatAmount(val) : <span className="text-text-muted">&mdash;</span>}
                </td>
              )
            })}
          </tr>
        ))}
        {categoryTotals === undefined ? (
          <tr>
            <td colSpan={currencies.length + 1} className="py-3">
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-4 bg-surface-muted rounded-sm animate-pulse" />
                ))}
              </div>
            </td>
          </tr>
        ) : categoryTotals.length > 0 ? (
          <>
            <tr>
              <td colSpan={currencies.length + 1} className="py-1">
                <div className="border-t border-border" />
              </td>
            </tr>
            <CategoryRows categoryTotals={categoryTotals} currencies={currencies} />
          </>
        ) : null}
      </tbody>
    </table>
  )
}

function CategoryRows({ categoryTotals, currencies }: { categoryTotals: TransactionTotalItem[] | PlannedTransactionTotalItem[]; currencies: string[] }) {
  const catMap = new Map(categoryTotals.map((t) => [`${t.group}|${t.currency}`, t.total]))
  const categoryNames = [...new Set(categoryTotals.map((t) => t.group))]

  return (
    <>
      {categoryNames.map((name) => (
        <tr key={name} className="hover:bg-surface-hover transition-colors text-text">
          <td className="py-2 pr-4 font-sans">{name}</td>
          {currencies.map((c) => {
            const val = catMap.get(`${name}|${c}`)
            return (
              <td key={c} className="py-2 px-3 text-right font-mono">
                {val != null ? formatAmount(val) : <span className="text-text-muted">&mdash;</span>}
              </td>
            )
          })}
        </tr>
      ))}
    </>
  )
}

function PlannedTable({ categoryTotals }: { categoryTotals: PlannedTransactionTotalItem[] }) {
  const currencies = extractCurrencies(categoryTotals)
  if (currencies.length === 0) return null

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-text-muted text-xs font-sans border-b border-border">
          <th className="text-left py-2 pr-4 font-normal"></th>
          {currencies.map((c) => (
            <th key={c} className="text-right py-2 px-3 font-normal">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <CategoryRows categoryTotals={categoryTotals} currencies={currencies} />
      </tbody>
    </table>
  )
}

function ExchangeTable({ totals }: { totals: CurrencyExchangeTotalItem[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-text-muted text-xs font-sans border-b border-border">
          <th className="text-right py-2 px-3 font-normal">From</th>
          <th className="w-6 py-2 font-normal"></th>
          <th className="text-right py-2 px-3 font-normal">To</th>
        </tr>
      </thead>
      <tbody>
        {totals.map((item) => (
          <tr key={`${item.from_currency}-${item.to_currency}`} className="hover:bg-surface-hover transition-colors text-text">
            <td className="py-2 px-3 text-right font-mono">
              {formatAmount(item.from_total)} {item.from_currency}
            </td>
            <td className="py-2 text-center">
              <ArrowRight size={14} className="text-text-muted inline" />
            </td>
            <td className="py-2 px-3 text-right font-mono">
              {formatAmount(item.to_total)} {item.to_currency}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ============= Component =============

export default function TotalsSummary(props: Props) {
  if (props.mode === 'transactions') {
    if (props.typeTotals.length === 0) return null
    const currencies = extractCurrencies([...props.typeTotals, ...(props.categoryTotals ?? [])])
    return (
      <div className="bg-surface border border-border rounded-sm px-4 py-3 mt-2 w-fit">
        <TransactionTable typeTotals={props.typeTotals} categoryTotals={props.categoryTotals} currencies={currencies} />
      </div>
    )
  }

  if (props.mode === 'planned') {
    if (props.categoryTotals.length === 0) return null
    return (
      <div className="bg-surface border border-border rounded-sm px-4 py-3 mt-2 w-fit">
        <PlannedTable categoryTotals={props.categoryTotals} />
      </div>
    )
  }

  if (props.mode === 'exchanges') {
    if (props.totals.length === 0) return null
    return (
      <div className="bg-surface border border-border rounded-sm px-4 py-3 mt-2 w-fit">
        <ExchangeTable totals={props.totals} />
      </div>
    )
  }

  return null
}
