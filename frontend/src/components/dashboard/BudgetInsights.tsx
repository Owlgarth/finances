import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Table2, ChartColumn } from 'lucide-react'
import { budgetsApi, reportsApi } from '../../api/client'
import { useBudgets } from '../../hooks/useDomain'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { formatAmount } from '../../utils/format'
import Select from '../common/Select'
import type { BudgetHistoryPeriod, BudgetSummaryItem } from '../../types'

/* Chart tokens (validated palette, see index.css):
   series-1 = Planned, series-2 = Actual. Text never wears series color. */
const SERIES = {
  planned: 'var(--chart-series-1)',
  actual: 'var(--chart-series-2)',
} as const

const compactFmt = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const compact = (v: string | number) => compactFmt.format(typeof v === 'number' ? v : parseFloat(v))

/** Round up to 1/2/5 × 10^k — clean axis maximum. */
function niceMax(max: number): number {
  if (max <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(max))
  const f = max / exp
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp
}

interface TipState {
  x: number
  y: number
  title: string
  rows: { series: keyof typeof SERIES; label: string; value: string }[]
}

function Tooltip({ tip }: { tip: TipState }) {
  return (
    <div
      className="absolute z-10 pointer-events-none bg-surface border border-border rounded-sm px-2.5 py-2 text-xs"
      style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 6px))' }}
    >
      <p className="text-text-muted mb-1 whitespace-nowrap">{tip.title}</p>
      {tip.rows.map((r) => (
        <p key={r.label} className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="inline-block w-2.5 h-[3px] rounded-full" style={{ background: SERIES[r.series] }} />
          <span className="font-mono font-medium text-text">{r.value}</span>
          <span className="text-text-muted">{r.label}</span>
        </p>
      ))}
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3">
      {(['planned', 'actual'] as const).map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-[10px] text-text-muted capitalize">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: SERIES[s] }} />
          {s}
        </span>
      ))}
    </div>
  )
}

function StatTile({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: 'good' | 'bad' | 'muted' }) {
  const subClass = subTone === 'good' ? 'text-positive' : subTone === 'bad' ? 'text-negative' : 'text-text-muted'
  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">{label}</p>
      <p className="text-xl font-semibold text-text">{value}</p>
      {sub && <p className={`text-xs mt-0.5 ${subClass}`}>{sub}</p>}
    </div>
  )
}

/** Spend meter: fill severity accent → warning → negative; track = lighter step of the fill's own ramp. */
function SpendMeter({ planned, actual }: { planned: number; actual: number }) {
  const pct = planned > 0 ? (actual / planned) * 100 : 0
  const fill = pct > 100 ? 'var(--color-negative)' : pct >= 85 ? 'var(--color-warning)' : 'var(--chart-series-1)'
  const label =
    planned <= 0
      ? 'No plan set for this period'
      : pct > 100
        ? `Over plan — ${Math.round(pct)}% used`
        : `${Math.round(pct)}% of plan used`
  return (
    <div>
      <div className="h-2 rounded-sm overflow-hidden" style={{ background: 'var(--chart-track)' }}>
        <div className="h-full rounded-r-sm" style={{ width: `${Math.min(pct, 100)}%`, background: fill }} />
      </div>
      <p className="text-[10px] text-text-muted mt-1">{label}</p>
    </div>
  )
}

function useTip() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState | null>(null)
  const show = (target: HTMLElement, title: string, rows: TipState['rows']) => {
    const host = containerRef.current
    if (!host) return
    const rect = target.getBoundingClientRect()
    const hostRect = host.getBoundingClientRect()
    setTip({ x: rect.left - hostRect.left + rect.width / 2, y: rect.top - hostRect.top, title, rows })
  }
  return { containerRef, tip, setTip, show }
}

/** Horizontal paired bars: planned vs actual per category (top 6 + Other). */
function CategoryBars({ items, currency }: { items: BudgetSummaryItem[]; currency: string }) {
  const { containerRef, tip, setTip, show } = useTip()

  const rows = useMemo(() => {
    const inCurrency = items.filter((i) => i.currency_code === currency)
    const sorted = [...inCurrency].sort((a, b) => parseFloat(b.planned) - parseFloat(a.planned) || parseFloat(b.actual) - parseFloat(a.actual))
    const top = sorted.slice(0, 6)
    const rest = sorted.slice(6)
    const result = top.map((i) => ({ name: i.category_name, planned: parseFloat(i.planned), actual: parseFloat(i.actual) }))
    if (rest.length > 0) {
      result.push({
        name: 'Other',
        planned: rest.reduce((s, i) => s + parseFloat(i.planned), 0),
        actual: rest.reduce((s, i) => s + parseFloat(i.actual), 0),
      })
    }
    return result
  }, [items, currency])

  if (rows.length === 0) return <p className="text-sm text-text-muted py-6 text-center">No categories with data this period.</p>

  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.planned, r.actual))))

  return (
    <div ref={containerRef} className="relative space-y-2.5">
      {tip && <Tooltip tip={tip} />}
      {rows.map((r) => (
        <div
          key={r.name}
          tabIndex={0}
          aria-label={`${r.name}: planned ${formatAmount(r.planned)}, spent ${formatAmount(r.actual)} ${currency}`}
          className="flex items-center gap-2 group outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
          onPointerMove={(e) =>
            show(e.currentTarget, r.name, [
              { series: 'planned', label: 'planned', value: formatAmount(r.planned) },
              { series: 'actual', label: 'spent', value: formatAmount(r.actual) },
            ])
          }
          onPointerLeave={() => setTip(null)}
          onFocus={(e) =>
            show(e.currentTarget, r.name, [
              { series: 'planned', label: 'planned', value: formatAmount(r.planned) },
              { series: 'actual', label: 'spent', value: formatAmount(r.actual) },
            ])
          }
          onBlur={() => setTip(null)}
        >
          <span className="w-24 shrink-0 text-xs text-text truncate">{r.name}</span>
          <div className="flex-1 border-l border-border pl-px py-0.5 group-hover:bg-surface-hover rounded-r-sm transition-colors">
            <div className="h-[7px] rounded-r-sm" style={{ width: `${(r.planned / max) * 100}%`, background: SERIES.planned }} />
            <div className="h-[2px]" />
            <div className="flex items-center gap-1.5">
              <div className="h-[7px] rounded-r-sm" style={{ width: `${(r.actual / max) * 100}%`, background: SERIES.actual }} />
              <span className="text-[10px] font-mono text-text-muted leading-none">{compact(r.actual)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Grouped columns: planned vs actual per period, oldest first. */
function PeriodColumns({ periods, currency, currentPeriodId }: { periods: BudgetHistoryPeriod[]; currency: string; currentPeriodId: number | null }) {
  const { containerRef, tip, setTip, show } = useTip()

  const cols = periods.map((p) => ({
    id: p.id,
    name: p.name,
    label: format(parseISO(p.start_date), periods.length > 1 && new Date(p.start_date).getFullYear() !== new Date().getFullYear() ? 'MMM yy' : 'MMM'),
    planned: parseFloat(p.totals[currency]?.planned ?? '0'),
    actual: parseFloat(p.totals[currency]?.actual ?? '0'),
  }))

  if (cols.length === 0) return <p className="text-sm text-text-muted py-6 text-center">No periods yet.</p>

  const max = niceMax(Math.max(...cols.map((c) => Math.max(c.planned, c.actual)), 1))
  const ticks = [1, 2, 3, 4].map((i) => (max / 4) * i)
  const PLOT_H = 150

  return (
    <div ref={containerRef} className="relative">
      {tip && <Tooltip tip={tip} />}
      <div className="flex">
        {/* y ticks */}
        <div className="relative w-10 shrink-0" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-1.5 -translate-y-1/2 text-[9px] font-mono tabular-nums text-text-muted" style={{ top: PLOT_H - (t / max) * PLOT_H }}>
              {compact(t)}
            </span>
          ))}
        </div>
        {/* plot */}
        <div className="relative flex-1 border-b border-border" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <div key={t} className="absolute left-0 right-0 border-t border-border/60" style={{ top: PLOT_H - (t / max) * PLOT_H }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around">
            {cols.map((c) => (
              <div
                key={c.id}
                tabIndex={0}
                aria-label={`${c.name}: planned ${formatAmount(c.planned)}, spent ${formatAmount(c.actual)} ${currency}`}
                className="flex items-end justify-center gap-[2px] h-full px-2 outline-none hover:bg-surface-hover focus-visible:bg-surface-hover transition-colors"
                onPointerMove={(e) =>
                  show(e.currentTarget, c.name, [
                    { series: 'planned', label: 'planned', value: formatAmount(c.planned) },
                    { series: 'actual', label: 'spent', value: formatAmount(c.actual) },
                  ])
                }
                onPointerLeave={() => setTip(null)}
                onFocus={(e) =>
                  show(e.currentTarget, c.name, [
                    { series: 'planned', label: 'planned', value: formatAmount(c.planned) },
                    { series: 'actual', label: 'spent', value: formatAmount(c.actual) },
                  ])
                }
                onBlur={() => setTip(null)}
              >
                <div className="w-[14px] rounded-t-sm" style={{ height: `${(c.planned / max) * 100}%`, background: SERIES.planned }} />
                <div className="w-[14px] rounded-t-sm" style={{ height: `${(c.actual / max) * 100}%`, background: SERIES.actual }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* x labels */}
      <div className="flex">
        <div className="w-10 shrink-0" />
        <div className="flex-1 flex justify-around">
          {cols.map((c) => (
            <span key={c.id} className={`text-[10px] font-mono mt-1 ${c.id === currentPeriodId ? 'text-text' : 'text-text-muted'}`}>
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[9px] font-mono uppercase tracking-widest text-text-muted border-b border-border">
            {head.map((h, i) => (
              <th key={h} className={`py-1.5 px-2 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td key={ci} className={`py-1.5 px-2 ${ci === 0 ? 'text-left text-text' : 'text-right font-mono tabular-nums text-text-muted'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartCard({ title, children, table }: { title: string; children: React.ReactNode; table: React.ReactNode }) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className="border border-border rounded-sm bg-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text">{title}</h3>
        <div className="flex items-center gap-3">
          <Legend />
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-label={showTable ? 'Show chart' : 'Show table'}
            className="text-text-muted hover:text-text p-1 rounded-sm hover:bg-surface-hover transition-colors"
          >
            {showTable ? <ChartColumn size={13} /> : <Table2 size={13} />}
          </button>
        </div>
      </div>
      {showTable ? table : children}
    </div>
  )
}

export default function BudgetInsights() {
  const { workspace } = useWorkspace()
  const { data: budgets = [] } = useBudgets(false)

  const [budgetId, setBudgetId] = useState<number | null>(null)
  useEffect(() => {
    if (budgetId !== null && budgets.some((b) => b.id === budgetId)) return
    const preferred = budgets.find((b) => b.id === workspace?.default_budget_id) ?? budgets[0]
    setBudgetId(preferred?.id ?? null)
  }, [budgets, workspace?.default_budget_id, budgetId])

  const budget = budgets.find((b) => b.id === budgetId)

  // Materialize + fetch the current period for monthly/N-week budgets.
  const { data: currentPeriod } = useQuery({
    queryKey: ['current-period', budgetId],
    queryFn: () => budgetsApi.currentPeriod(budgetId!),
    enabled: !!budgetId && budget?.cadence !== 'custom',
    retry: false,
  })

  const historyEnabled = !!budgetId && (budget?.cadence === 'custom' || !!currentPeriod)
  const { data: history, isPlaceholderData } = useQuery({
    queryKey: ['budget-history', budgetId, currentPeriod?.id ?? null],
    queryFn: () => reportsApi.budgetHistory(budgetId!, 6),
    enabled: historyEnabled,
    placeholderData: (prev) => prev,
  })

  const periods = useMemo(() => history?.periods ?? [], [history])
  const currentPeriodId = currentPeriod?.id ?? periods[periods.length - 1]?.id ?? null

  const { data: summary } = useQuery({
    queryKey: ['budget-summary', budgetId, currentPeriodId],
    queryFn: () => reportsApi.budgetSummary(budgetId!, currentPeriodId!),
    enabled: !!budgetId && !!currentPeriodId,
    placeholderData: (prev) => prev,
  })

  // Currencies present anywhere in the data; default = biggest plan in the current period.
  const currencies = useMemo(() => {
    const codes = new Set<string>()
    periods.forEach((p) => Object.keys(p.totals).forEach((c) => codes.add(c)))
    Object.keys(summary?.totals ?? {}).forEach((c) => codes.add(c))
    return Array.from(codes).sort()
  }, [periods, summary])

  const [currency, setCurrency] = useState<string | null>(null)
  useEffect(() => {
    if (currency && currencies.includes(currency)) return
    if (currencies.length === 0) return
    const current = periods[periods.length - 1]
    const best = current
      ? currencies.reduce((a, b) =>
          parseFloat(current.totals[b]?.planned ?? '0') > parseFloat(current.totals[a]?.planned ?? '0') ? b : a,
        )
      : currencies[0]
    setCurrency(best)
  }, [currencies, currency, periods])

  if (budgets.length === 0) return null

  const totals = currency ? (summary?.totals[currency] ?? null) : null
  const planned = totals ? parseFloat(totals.planned) : 0
  const actual = totals ? parseFloat(totals.actual) : 0
  const remaining = totals ? parseFloat(totals.remaining) : 0

  const prevPeriod = periods.length >= 2 ? periods[periods.length - 2] : null
  const prevActual = prevPeriod && currency ? parseFloat(prevPeriod.totals[currency]?.actual ?? '0') : null
  const spentDelta = prevActual !== null ? actual - prevActual : null

  const periodTableRows = periods.map((p) => [
    p.name,
    formatAmount(p.totals[currency ?? '']?.planned ?? '0'),
    formatAmount(p.totals[currency ?? '']?.actual ?? '0'),
  ])
  const categoryTableRows = (summary?.items ?? [])
    .filter((i) => i.currency_code === currency)
    .map((i) => [i.category_name, formatAmount(i.planned), formatAmount(i.actual), formatAmount(i.remaining)])

  return (
    <div className="mb-6">
      {/* Filter row — scopes everything below it */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-56">
          <Select
            value={budgetId}
            onChange={setBudgetId}
            options={budgets.map((b) => ({ value: b.id, label: b.name }))}
            placeholder="Select budget"
            aria-label="Budget"
          />
        </div>
        {currencies.length > 1 && (
          <div className="w-28">
            <Select
              value={currency}
              onChange={setCurrency}
              options={currencies.map((c) => ({ value: c, label: c }))}
              aria-label="Currency"
              mono
            />
          </div>
        )}
      </div>

      <div className={`space-y-4 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
        {/* KPI row — current period */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatTile label={`Planned · ${summary?.period.name ?? 'current period'}`} value={totals ? formatAmount(planned) : '—'} sub={currency ?? undefined} subTone="muted" />
          <StatTile
            label="Spent"
            value={totals ? formatAmount(actual) : '—'}
            sub={
              spentDelta !== null && prevPeriod
                ? `${spentDelta >= 0 ? '+' : '−'}${formatAmount(Math.abs(spentDelta))} vs ${prevPeriod.name}`
                : (currency ?? undefined)
            }
            subTone={spentDelta === null ? 'muted' : spentDelta > 0 ? 'bad' : 'good'}
          />
          <StatTile label="Remaining" value={totals ? formatAmount(remaining) : '—'} sub={currency ?? undefined} subTone={remaining < 0 ? 'bad' : 'muted'} />
        </div>

        <div className="border border-border rounded-sm bg-surface p-4">
          <SpendMeter planned={planned} actual={actual} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard
            title="This period by category"
            table={<DataTable head={['Category', 'Planned', 'Spent', 'Remaining']} rows={categoryTableRows} />}
          >
            <CategoryBars items={summary?.items ?? []} currency={currency ?? ''} />
          </ChartCard>
          <ChartCard
            title="Planned vs spent by period"
            table={<DataTable head={['Period', 'Planned', 'Spent']} rows={periodTableRows} />}
          >
            <PeriodColumns periods={periods} currency={currency ?? ''} currentPeriodId={currentPeriodId} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
