import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Table2, ChartColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { budgetsApi, reportsApi } from '../../api/client'
import { useBudgets, useEnabledCurrencies } from '../../hooks/useDomain'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { formatAmount, getNumberStyle } from '../../utils/format'
import { activeCurrencyCodes } from '../../utils/currencies'
import Select from '../common/Select'
import type { BudgetHistoryPeriod, BudgetSummaryItem } from '../../types'

/* Chart tokens (validated palette, see index.css):
   series-1 = Planned, series-2 = Actual. Text never wears series color. */
const SERIES = {
  planned: 'var(--chart-series-1)',
  actual: 'var(--chart-series-2)',
} as const

/* Compact axis numbers per numberStyle. 'fr-FR' supplies the eu shape:
   NBSP grouping + ',' decimal + neutral Latin compact suffixes (k, M),
   independent of the UI language (number format is its own preference). */
const COMPACT_FMTS: Record<'en' | 'eu', Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }),
  eu: new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }),
}
const compact = (v: string | number) =>
  COMPACT_FMTS[getNumberStyle()].format(typeof v === 'number' ? v : parseFloat(v))

/** Round up to 1/2/5 × 10^k - clean axis maximum. */
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
  const { t } = useTranslation('numbers')
  return (
    <div className="flex items-center gap-3">
      {(['planned', 'actual'] as const).map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-[10px] text-text-muted capitalize">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px]" style={{ background: SERIES[s] }} />
          {s === 'planned' ? t('insights.seriesPlanned') : t('insights.seriesActual')}
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
  const { t } = useTranslation('numbers')
  const pct = planned > 0 ? (actual / planned) * 100 : 0
  const fill = pct > 100 ? 'var(--color-negative)' : pct >= 85 ? 'var(--color-warning)' : 'var(--chart-series-1)'
  const label =
    planned <= 0
      ? t('insights.noPlanSet')
      : pct > 100
        ? t('insights.overPlanUsed', { pct: Math.round(pct) })
        : t('insights.planUsed', { pct: Math.round(pct) })
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
function CategoryBars({ items, currency, loading }: { items: BudgetSummaryItem[]; currency: string; loading: boolean }) {
  const { t } = useTranslation('numbers')
  const { containerRef, tip, setTip, show } = useTip()

  const rows = useMemo(() => {
    const inCurrency = items.filter((i) => i.currency_code === currency)
    const sorted = [...inCurrency].sort((a, b) => parseFloat(b.planned) - parseFloat(a.planned) || parseFloat(b.actual) - parseFloat(a.actual))
    const top = sorted.slice(0, 6)
    const rest = sorted.slice(6)
    const result = top.map((i) => ({ name: i.category_name, planned: parseFloat(i.planned), actual: parseFloat(i.actual) }))
    if (rest.length > 0) {
      result.push({
        name: t('insights.otherCategory'),
        planned: rest.reduce((s, i) => s + parseFloat(i.planned), 0),
        actual: rest.reduce((s, i) => s + parseFloat(i.actual), 0),
      })
    }
    return result
  }, [items, currency, t])

  if (loading)
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-4 bg-surface-muted rounded-sm animate-pulse" />
        ))}
      </div>
    )

  if (rows.length === 0) return <p className="text-sm text-text-muted py-6 text-center">{t('insights.noCategoriesWithData')}</p>

  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.planned, r.actual))))

  return (
    <div ref={containerRef} className="relative space-y-2.5">
      {tip && <Tooltip tip={tip} />}
      {rows.map((r) => (
        <div
          key={r.name}
          tabIndex={0}
          aria-label={t('insights.rowAriaLabel', { name: r.name, planned: formatAmount(r.planned), spent: formatAmount(r.actual), currency })}
          className="flex items-center gap-2 group outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-sm"
          onPointerMove={(e) =>
            show(e.currentTarget, r.name, [
              { series: 'planned', label: t('insights.seriesPlanned'), value: formatAmount(r.planned) },
              { series: 'actual', label: t('insights.seriesSpent'), value: formatAmount(r.actual) },
            ])
          }
          onPointerLeave={() => setTip(null)}
          onFocus={(e) =>
            show(e.currentTarget, r.name, [
              { series: 'planned', label: t('insights.seriesPlanned'), value: formatAmount(r.planned) },
              { series: 'actual', label: t('insights.seriesSpent'), value: formatAmount(r.actual) },
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
function PeriodColumns({ periods, currency, currentPeriodId, loading }: { periods: BudgetHistoryPeriod[]; currency: string; currentPeriodId: number | null; loading: boolean }) {
  const { t } = useTranslation('numbers')
  const { containerRef, tip, setTip, show } = useTip()

  const cols = periods.map((p) => ({
    id: p.id,
    name: p.name,
    // Month-abbreviation axis labels: deliberately NOT wired to the
    // date-fns locale yet (numeric eu-style axis labels would need the
    // same plumbing) - tracked as follow-up, out of scope here.
    label: format(parseISO(p.start_date), periods.length > 1 && new Date(p.start_date).getFullYear() !== new Date().getFullYear() ? 'MMM yy' : 'MMM'),
    planned: parseFloat(p.totals[currency]?.planned ?? '0'),
    actual: parseFloat(p.totals[currency]?.actual ?? '0'),
  }))

  if (loading) return <div className="h-44 bg-surface-muted rounded-sm animate-pulse" />

  if (cols.length === 0) return <p className="text-sm text-text-muted py-6 text-center">{t('insights.noPeriodsYet')}</p>

  const max = niceMax(Math.max(...cols.map((c) => Math.max(c.planned, c.actual)), 1))
  const ticks = [1, 2, 3, 4].map((i) => (max / 4) * i)
  const PLOT_H = 150

  return (
    <div ref={containerRef} className="relative">
      {tip && <Tooltip tip={tip} />}
      <div className="flex">
        {/* y ticks */}
        <div className="relative w-10 shrink-0" style={{ height: PLOT_H }}>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-1.5 -translate-y-1/2 text-[9px] font-mono tabular-nums text-text-muted" style={{ top: PLOT_H - (tick / max) * PLOT_H }}>
              {compact(tick)}
            </span>
          ))}
        </div>
        {/* plot */}
        <div className="relative flex-1 border-b border-border" style={{ height: PLOT_H }}>
          {ticks.map((tick) => (
            <div key={tick} className="absolute left-0 right-0 border-t border-border/60" style={{ top: PLOT_H - (tick / max) * PLOT_H }} />
          ))}
          <div className="absolute inset-0 flex items-end justify-around">
            {cols.map((c) => (
              <div
                key={c.id}
                tabIndex={0}
                aria-label={t('insights.rowAriaLabel', { name: c.name, planned: formatAmount(c.planned), spent: formatAmount(c.actual), currency })}
                className="flex items-end justify-center gap-[2px] h-full px-2 outline-none hover:bg-surface-hover focus-visible:bg-surface-hover transition-colors"
                onPointerMove={(e) =>
                  show(e.currentTarget, c.name, [
                    { series: 'planned', label: t('insights.seriesPlanned'), value: formatAmount(c.planned) },
                    { series: 'actual', label: t('insights.seriesSpent'), value: formatAmount(c.actual) },
                  ])
                }
                onPointerLeave={() => setTip(null)}
                onFocus={(e) =>
                  show(e.currentTarget, c.name, [
                    { series: 'planned', label: t('insights.seriesPlanned'), value: formatAmount(c.planned) },
                    { series: 'actual', label: t('insights.seriesSpent'), value: formatAmount(c.actual) },
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
  const { t } = useTranslation('numbers')
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
            aria-label={t(showTable ? 'insights.showChart' : 'insights.showTable')}
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
  const { t } = useTranslation('numbers')
  const { workspace } = useWorkspace()
  const { data: budgets = [] } = useBudgets(false)
  const { data: currencies = [] } = useEnabledCurrencies()

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

  // First-load pendings - true from budget selection until the query chain
  // (currentPeriod → history → summary) delivers data. A query waiting on
  // prerequisites (`enabled: false`) also has no data yet, so gating on data
  // presence covers those windows that `isLoading` misses; `placeholderData`
  // keeps budget switches out of this (the opacity-60 dimming handles those).
  const historyPending = !!budgetId && !history
  const summaryPending = !!budgetId && !summary

  // Data presence for the shared derivation: every code the loaded data
  // carries - summary rows and totals plus the six history periods the
  // charts render (a code that only exists in history must stay
  // switchable). Adapted to the util's {currency_code} row shape.
  const dataCurrencies = useMemo(() => {
    const codes = new Set<string>()
    periods.forEach((p) => Object.keys(p.totals).forEach((c) => codes.add(c)))
    ;(summary?.items ?? []).forEach((i) => codes.add(i.currency_code))
    Object.keys(summary?.totals ?? {}).forEach((c) => codes.add(c))
    return Array.from(codes).map((currency_code) => ({ currency_code }))
  }, [periods, summary])

  // Same currency derivation as the budget detail page: the budget's
  // configured currencies in stored order (first = default view),
  // data-only codes appended after in enabled order, and the PRIMARY as
  // the fallback when config and data are both empty - the first entry
  // of the creation-ordered enabled list (the backend orders it with the
  // workspace's primary first), never the alphabetically-first code.
  const activeCurrencies = useMemo(
    () =>
      activeCurrencyCodes(
        budget?.currency_codes ?? [],
        dataCurrencies,
        currencies.map((c) => c.code),
        currencies[0]?.code ?? '',
      ),
    [budget, dataCurrencies, currencies],
  )

  // Derived-until-touched currency selection: the view follows
  // activeCurrencies[0] (the first configured currency) until the user
  // picks a code; a touched code that leaves the list (budget currencies
  // edited, budget switched) falls back to the first entry
  // deterministically. Render-time derivation - no syncing effect.
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null)
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const currency = currencyTouched && selectedCurrency !== null && activeCurrencies.includes(selectedCurrency) ? selectedCurrency : activeCurrencies[0]

  // Picking a budget resets to its first configured currency (a surviving
  // code from the previous budget's list must not stay selected); picking
  // a currency marks the selection touched so re-derivations stop
  // overwriting the user's choice.
  const selectBudget = (id: number) => {
    setBudgetId(id)
    setSelectedCurrency(null)
    setCurrencyTouched(false)
  }
  const selectCurrency = (code: string) => {
    setSelectedCurrency(code)
    setCurrencyTouched(true)
  }

  // Mirror of the budget page's band gate: the control renders once the
  // budget and the enabled-currency list are known (chip when exactly one
  // code is active, Select otherwise); while the enabled list is empty
  // the codes are unknowable, so keep today's hide behavior.
  const showCurrencyControl = budget != null && currencies.length > 0

  if (budgets.length === 0) return null

  const totals = currency ? (summary?.totals[currency] ?? null) : null
  const planned = totals ? parseFloat(totals.planned) : 0
  const actual = totals ? parseFloat(totals.actual) : 0
  const remaining = totals ? parseFloat(totals.remaining) : 0

  const prevPeriod = periods.length >= 2 ? periods[periods.length - 2] : null
  const prevActual = prevPeriod && currency ? parseFloat(prevPeriod.totals[currency]?.actual ?? '0') : null
  const spentDelta = prevActual !== null ? actual - prevActual : null

  const periodTableRows = currency
    ? periods.map((p) => [
        p.name,
        formatAmount(p.totals[currency]?.planned ?? '0'),
        formatAmount(p.totals[currency]?.actual ?? '0'),
      ])
    : []
  const categoryTableRows = (summary?.items ?? [])
    .filter((i) => i.currency_code === currency)
    .map((i) => [i.category_name, formatAmount(i.planned), formatAmount(i.actual), formatAmount(i.remaining)])

  return (
    <div className="mb-6">
      {/* Filter row - scopes everything below it */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="w-56">
          <Select
            value={budgetId}
            onChange={selectBudget}
            options={budgets.map((b) => ({ value: b.id, label: b.name }))}
            placeholder={t('insights.selectBudget')}
            aria-label={t('insights.budgetAriaLabel')}
          />
        </div>
        {showCurrencyControl &&
          (activeCurrencies.length > 1 ? (
            <div className="w-28">
              <Select
                value={currency}
                onChange={selectCurrency}
                options={activeCurrencies.map((c) => ({ value: c, label: c }))}
                aria-label={t('insights.currencyAriaLabel')}
                mono
              />
            </div>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none">
              {currency}
            </span>
          ))}
        {budget && (
          <Link to={`/budgets/${budget.id}`} className="text-xs text-primary hover:text-primary-hover touch-hit">
            {t('insights.viewBudget')}
          </Link>
        )}
      </div>

      <div className={`space-y-4 transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
        {/* KPI row - current period */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryPending ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="border border-border rounded-sm bg-surface p-4 space-y-2">
                <div className="h-3 w-24 bg-surface-muted rounded-sm animate-pulse" />
                <div className="h-6 w-28 bg-surface-muted rounded-sm animate-pulse" />
              </div>
            ))
          ) : (
            <>
              <StatTile label={t('insights.plannedPeriodLabel', { period: summary?.period.name ?? t('insights.currentPeriodFallback') })} value={totals ? formatAmount(planned) : '—'} sub={currency ?? undefined} subTone="muted" />
              <StatTile
                label={t('insights.spent')}
                value={totals ? formatAmount(actual) : '—'}
                sub={
                  spentDelta !== null && prevPeriod
                    ? t('insights.changeVsPeriod', {
                        delta: `${spentDelta >= 0 ? '+' : '−'}${formatAmount(Math.abs(spentDelta))}`,
                        period: prevPeriod.name,
                      })
                    : (currency ?? undefined)
                }
                subTone={spentDelta === null ? 'muted' : spentDelta > 0 ? 'bad' : 'good'}
              />
              <StatTile label={t('insights.remaining')} value={totals ? formatAmount(remaining) : '—'} sub={currency ?? undefined} subTone={remaining < 0 ? 'bad' : 'muted'} />
            </>
          )}
        </div>

        <div className="border border-border rounded-sm bg-surface p-4">
          {summaryPending ? <div className="h-8 bg-surface-muted rounded-sm animate-pulse" /> : <SpendMeter planned={planned} actual={actual} />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ChartCard
            title={t('insights.byCategoryTitle')}
            table={<DataTable head={[t('insights.colCategory'), t('insights.colPlanned'), t('insights.colSpent'), t('insights.colRemaining')]} rows={categoryTableRows} />}
          >
            <CategoryBars items={summary?.items ?? []} currency={currency ?? ''} loading={summaryPending} />
          </ChartCard>
          <ChartCard
            title={t('insights.byPeriodTitle')}
            table={<DataTable head={[t('insights.colPeriod'), t('insights.colPlanned'), t('insights.colSpent')]} rows={periodTableRows} />}
          >
            <PeriodColumns periods={periods} currency={currency ?? ''} currentPeriodId={currentPeriodId} loading={historyPending} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
