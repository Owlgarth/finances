import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBudgets, useWorkspaceCategories } from '../../hooks/useDomain'
import { monthRange, toIsoDate } from '../../utils/dates'
import { createUpdateParams, intListParam } from '../../utils/params'
import AmountInput from './AmountInput'
import { FilterField } from './FilterBar'
import MultiSelect from './MultiSelect'
import { controlHeightClass, inputClass } from './formStyles'

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
  // All time: no range() - clicking clears both bounds ({from: null, to:
  // null} deletes the params via ParamPatch). LAST position: the row
  // reads narrow -> broad.
  { labelKey: 'listFilters.presetAllTime', allTime: true },
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
          <MultiSelect values={budgetFilter} onChange={setBudgetFilter} options={budgetOptions} placeholder={t('listFilters.allBudgets')} aria-label={t('listFilters.byBudgetAria')} className="w-full" />
        </FilterField>
      )}
      {categories.length > 0 && (
        <FilterField label={t('listFilters.category')}>
          <MultiSelect values={categoryFilter} onChange={(v) => updateParams({ category: v })} options={categoryOptions} placeholder={t('listFilters.allCategories')} aria-label={t('listFilters.byCategoryAria')} searchable className="w-full" />
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
            // All time has no range() - clicking it clears both bounds,
            // and it is active only when NEITHER date param is set. On
            // Transactions (no date default) it therefore renders active
            // on first load: a truthful display of that page's default
            // state, not a bug to fix.
            const range = 'allTime' in preset ? null : preset.range()
            // Range presets are active only on an EXACT match: any manually
            // edited bound leaves every chip off by construction.
            const active = range
              ? dateFrom === range.from && dateTo === range.to
              : dateFrom === '' && dateTo === ''
            return (
              <button
                key={preset.labelKey}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  updateParams(range ? { from: range.from, to: range.to } : { from: null, to: null })
                }
                className={`text-xs border rounded-sm px-2 py-1 ${controlHeightClass} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
                  active ? 'border-border-focus bg-surface-hover text-text' : 'border-border text-text-muted'
                }`}
              >
                {t(preset.labelKey)}
              </button>
            )
          })}
        </div>
        {/* Mirrors the /transfers date-filter row: below sm the two date
            inputs cannot share the col-span-2 cell - each floors at its
            intrinsic ~160px minimum, so the pair plus the separator
            overflows on 320px screens. The row wraps and each w-full input
            claims its own full line (w-full doubles as the wrap recipe's
            basis-full); the dash separator is meaningless between stacked
            inputs - it would strand alone on the middle line, so it hides
            below sm. min-w-0 is not needed: no wrapped line ever shrinks
            below its content. At >=sm the max-sm variants emit nothing and
            rendering is unchanged. The row shows only when the host page's
            filter panel is open - why cold-load width matrices missed it. */}
        <div className="flex max-sm:flex-wrap items-center gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => updateParams({ from: e.target.value || null })} aria-label={t('listFilters.fromDateAria')} className={`${inputClass} max-sm:min-h-[44px]`} />
          <span className="text-text-muted text-xs max-sm:hidden">–</span>
          <input type="date" value={dateTo} onChange={(e) => updateParams({ to: e.target.value || null })} aria-label={t('listFilters.toDateAria')} className={`${inputClass} max-sm:min-h-[44px]`} />
        </div>
      </FilterField>
    </>
  )
}
