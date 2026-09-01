import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MultiSelect from '../common/MultiSelect'
import type { CatalogCurrency } from '../../types'
import { useEnabledCurrencies } from '../../hooks/useDomain'
import { labelClass } from '../common/formStyles'

interface CurrencySetFieldProps {
  /** Ordered set of selected currency codes; index 0 = shown first. */
  value: string[]
  /** Called with the full new order after a MultiSelect toggle or an arrow move. */
  onChange: (codes: string[]) => void
  /** Row-1 marker naming what index 0 means at this call site. Budgets pass
   *  nothing (the translated default marker); the workspace-creation form
   *  passes its own translated label. */
  primaryLabel?: string
  /** Muted trigger text when the set is empty. The translated default marks
   *  an empty set as derived-from-data (budgets). */
  placeholder?: string
  /** Explicit options source, for call sites that have no workspace yet (so no
   *  enabled-currencies query exists to read ambiently) - the workspace-creation
   *  form passes the filtered catalog. When absent, options come from
   *  useEnabledCurrencies() ambiently (budgets' behavior). */
  currencies?: CatalogCurrency[]
  /** Compact variant: MultiSelect + helper line only - the primary marker folds
   *  into the helper copy and the ordered list is omitted. For constrained call
   *  sites; the default (full) mode renders everything. */
  compact?: boolean
  /** Bridge link callback: renders the currency-management link under the
   *  picker cluster, jumping to where the pickable set itself is configured.
   *  Absent = no link. */
  onManageCurrencies?: () => void
}

// Next arrangement after moving the code at `idx` by `dir` (-1 up / +1 down).
// Returns the SAME array reference when the move would leave the range (the
// arrow buttons are disabled there anyway, so the setter is a cheap no-op).
// Swap logic mirrors the budget detail page's reorder idiom; the swap moves a
// code one position within the ordered list (the server-side order replaces
// the old localStorage persistence).
function moveCode(codes: string[], idx: number, dir: 1 | -1): string[] {
  const target = idx + dir
  if (target < 0 || target >= codes.length) return codes
  const next = [...codes]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  return next
}

/**
 * Ordered currency-set field (MultiSelect + optional reordering list).
 * Shared component: budgets use it in full mode with ambient
 * useEnabledCurrencies() options; the workspace-creation form uses compact
 * mode with explicit catalog options and its own primaryLabel. `value`
 * is the single order-significant source of truth (index 0 = shown first): the
 * MultiSelect appends new picks at the end and removes deselections; only the
 * arrow list reorders. Zero useState/useEffect - structurally lint-quiet.
 */
export default function CurrencySetField({
  value,
  onChange,
  primaryLabel,
  placeholder,
  currencies: currenciesProp,
  compact = false,
  onManageCurrencies,
}: CurrencySetFieldProps) {
  const { t } = useTranslation('settings')
  // Prop defaults cannot call hooks, so the translated fallbacks resolve here
  // in the body instead of in the destructuring defaults.
  const resolvedPrimaryLabel = primaryLabel ?? t('currencySet.defaultPrimary')
  const resolvedPlaceholder = placeholder ?? t('currencySet.automaticPlaceholder')
  // Ambient by default (dedup-seam rule: reference data from the useDomain
  // hooks, not props); the explicit prop overrides for pre-workspace call
  // sites. The hook runs unconditionally, above every branch; its query is
  // disabled when the prop feeds the options - prop-fed sites are
  // pre-workspace or pre-auth and have no enabled-currencies set to read,
  // so the ambient request would only be a wasted, rejected call.
  const { data: ambientCurrencies = [] } = useEnabledCurrencies(currenciesProp === undefined)
  const currencies = currenciesProp ?? ambientCurrencies
  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))

  return (
    <div>
      <label className={labelClass}>{t('currencySet.label')}</label>
      <MultiSelect
        values={value}
        onChange={onChange}
        options={currencyOptions}
        placeholder={resolvedPlaceholder}
        aria-label={t('currencySet.ariaLabel')}
      />
      {/* Compact: the primary marker folds into the helper copy; the ordered
          list below is omitted. The label keeps its own casing - Slavic nouns
          do not lowercase the way English cosmetics used to. */}
      {compact ? (
        <p className="mt-1 text-[11px] text-text-muted">{t('currencySet.firstShown', { label: resolvedPrimaryLabel })}</p>
      ) : (
        <p className="mt-1 text-[11px] text-text-muted">{t('currencySet.budgetHelper')}</p>
      )}
      {/* Bridge: below the MultiSelect and helper line, ABOVE the ordered
          list - it manages what is pickable (the catalog), so it belongs to
          the picker cluster. Only rendered when the callback is passed. The
          hit-area utility is safe on this STANDALONE link - the
          adjacent-button prohibition targets the arrow pair below. */}
      {onManageCurrencies && (
        <button
          type="button"
          onClick={onManageCurrencies}
          aria-label={t('currencySet.manageCurrenciesAria')}
          className="mt-1 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus rounded-sm"
        >
          <Settings2 size={13} />
          {t('currencySet.manageCurrencies')}
        </button>
      )}
      {!compact && value.length > 0 && (
        <ul className="mt-2 border border-border rounded-sm divide-y divide-border">
          {value.map((code, idx) => (
            <li key={code} className="flex items-center justify-between px-3 py-2">
              <span className="text-sm text-text">
                <span className="font-mono">{code}</span>
                <span className="ml-2 text-xs text-text-muted">
                  {currencies.find((c) => c.code === code)?.name ?? ''}
                </span>
                {idx === 0 && (
                  <span className="ml-2 text-[9px] font-mono uppercase tracking-widest text-text-muted">{resolvedPrimaryLabel}</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                {/* Real padded hit areas, never the shared hit-area utility:
                    the arrows are adjacent buttons whose expanded areas would
                    overlap (the defect BudgetDetailPage's order-config modal
                    has). The 44px floor fits inside the py-2 row via -my-2. */}
                <button
                  type="button"
                  onClick={() => onChange(moveCode(value, idx, -1))}
                  disabled={idx === 0}
                  aria-label={t('currencies.moveUp', { code })}
                  className="p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(moveCode(value, idx, 1))}
                  disabled={idx === value.length - 1}
                  aria-label={t('currencies.moveDown', { code })}
                  className="p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDown size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
