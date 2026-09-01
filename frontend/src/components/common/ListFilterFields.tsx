import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBudgets, useWorkspaceCategories } from '../../hooks/useDomain'
import { createUpdateParams, intListParam } from '../../utils/params'
import AmountInput from './AmountInput'
import { FilterField } from './FilterBar'
import MultiSelect from './MultiSelect'
import { controlHeightClass, inputClass } from './formStyles'

/** Local calendar date as YYYY-MM-DD. Never toISOString() - it renders the
    UTC day, which can sit a day off either end of a local-date range. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** First-to-last day of a month; out-of-range months roll over (Date math). */
function monthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: toIsoDate(new Date(year, month, 1)),
    to: toIsoDate(new Date(year, month + 1, 0)),
  }
}

// Ranges span the WHOLE period (month/year ends included): future dates inside
// the period matter for the Planned list, and post-dated transactions are not
// silently excluded either. "Today" is computed at click/render time so a
// session crossing midnight never serves a stale range. Labels resolve
// through t() at render time - the stable labelKey doubles as the React key
// so a language switch never re-keys the chips.
const DATE_PRESETS = [
  {
    labelKey: 'listFilters.presetThisMonth',
    range: () => {
      const now = new Date()
      return monthRange(now.getFullYear(), now.getMonth())
    },
  },
  {
    labelKey: 'listFilters.presetLastMonth',
    range: () => {
      const now = new Date()
      return monthRange(now.getFullYear(), now.getMonth() - 1)
    },
  },
  {
    labelKey: 'listFilters.presetLast30',
    range: () => {
      const start = new Date()
      start.setDate(start.getDate() - 29)
      return { from: toIsoDate(start), to: toIsoDate(new Date()) }
    },
  },
  {
    labelKey: 'listFilters.presetThisYear',
    range: () => {
      const year = new Date().getFullYear()
      return { from: `${year}-01-01`, to: `${year}-12-31` }
    },
  },
] as const

/**
 * The budget/category/amount/date filter-field group shared by the
 * Transactions and Planned panels. Self-contained: reads its filter values
 * from the URL search params and fetches budgets/categories through the
 * domain hooks, so call sites are a single element. The budget filter owns
 * the category picker — it narrows the options and prunes selections that no
 * longer belong to the selected budgets.
 */
interface Props {
  /** Label of the date-range field — "Date" (Transactions) / "Planned date". */
  dateLabel?: string
}

export default function ListFilterFields({ dateLabel }: Props) {
  const { t } = useTranslation('transactions')
  const [searchParams, setSearchParams] = useSearchParams()
  const updateParams = createUpdateParams(setSearchParams)
  const budgetFilter = intListParam(searchParams, 'budget')
  const categoryFilter = intListParam(searchParams, 'category')
  const amountMin = searchParams.get('amount_min') ?? ''
  const amountMax = searchParams.get('amount_max') ?? ''
  const dateFrom = searchParams.get('from') ?? ''
  const dateTo = searchParams.get('to') ?? ''

  const { data: budgets = [] } = useBudgets(false)
  const { data: categories = [] } = useWorkspaceCategories(false)

  const budgetOptions = budgets.map((b) => ({ value: b.id, label: b.name }))
  const budgetNames = new Map(budgets.map((b) => [b.id, b.name]))
  // Budget filter narrows the category picker; unless it pins categories to a
  // single budget, cross-budget names disambiguate with their budget's name.
  const budgetSet = new Set(budgetFilter)
  const showBudgetSuffix = budgets.length > 1 && budgetFilter.length !== 1
  const categoryOptions = categories
    .filter((c) => budgetSet.size === 0 || budgetSet.has(c.budget_id))
    .map((c) => ({
      value: c.id,
      label: showBudgetSuffix ? `${c.name} · ${budgetNames.get(c.budget_id) ?? ''}` : c.name,
    }))

  const setBudgetFilter = (values: number[]) => {
    // Keep only categories that still belong to the selected budgets.
    const nextBudgetSet = new Set(values)
    const kept = categoryFilter.filter((id) => {
      const category = categories.find((c) => c.id === id)
      return category !== undefined && (nextBudgetSet.size === 0 || nextBudgetSet.has(category.budget_id))
    })
    updateParams({ budget: values, category: kept })
  }

  return (
    <>
      {budgets.length > 0 && (
        <FilterField label={t('listFilters.budget')}>
          <MultiSelect values={budgetFilter} onChange={setBudgetFilter} options={budgetOptions} placeholder={t('listFilters.allBudgets')} aria-label={t('listFilters.byBudgetAria')} />
        </FilterField>
      )}
      {categories.length > 0 && (
        <FilterField label={t('listFilters.category')}>
          <MultiSelect values={categoryFilter} onChange={(v) => updateParams({ category: v })} options={categoryOptions} placeholder={t('listFilters.allCategories')} aria-label={t('listFilters.byCategoryAria')} searchable />
        </FilterField>
      )}
      <FilterField label={t('listFilters.amount')}>
        <div className="flex items-center gap-1.5">
          <AmountInput value={amountMin} onCommit={(v) => updateParams({ amount_min: v || null })} placeholder={t('listFilters.min')} aria-label={t('listFilters.minAmountAria')} />
          <span className="text-text-muted text-xs">–</span>
          <AmountInput value={amountMax} onCommit={(v) => updateParams({ amount_max: v || null })} placeholder={t('listFilters.max')} aria-label={t('listFilters.maxAmountAria')} />
        </div>
      </FilterField>
      <FilterField label={dateLabel ?? t('listFilters.dateLabel')} className="col-span-2">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DATE_PRESETS.map((preset) => {
            const { from, to } = preset.range()
            // Active only on an EXACT match: any manually edited bound leaves
            // every chip off by construction.
            const active = dateFrom === from && dateTo === to
            return (
              <button
                key={preset.labelKey}
                type="button"
                aria-pressed={active}
                onClick={() => updateParams({ from, to })}
                className={`text-xs border rounded-sm px-2 py-1 ${controlHeightClass} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
                  active ? 'border-border-focus bg-surface-hover text-text' : 'border-border text-text-muted'
                }`}
              >
                {t(preset.labelKey)}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => updateParams({ from: e.target.value || null })} aria-label={t('listFilters.fromDateAria')} className={`${inputClass} max-sm:min-h-[44px]`} />
          <span className="text-text-muted text-xs">–</span>
          <input type="date" value={dateTo} onChange={(e) => updateParams({ to: e.target.value || null })} aria-label={t('listFilters.toDateAria')} className={`${inputClass} max-sm:min-h-[44px]`} />
        </div>
      </FilterField>
    </>
  )
}
