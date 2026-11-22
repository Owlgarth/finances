import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Category } from '../../types'
import { formatAmount } from '../../utils/format'

/** One phone card's data, derived page-side (derivations and surface gates
 *  stay in the page): the ledger row plus display-only status, spend ratio
 *  and Activity deep link. */
export interface BudgetCategoryCardRow {
  category: Category
  planned: string
  actual: string
  remaining: string
  status: 'over' | 'near' | 'onTrack'
  /** Display-only spend ratio in percent: bar width and attention ordering. */
  pct: number
  /** /transactions deep link for this category and the viewed period. */
  activityUrl: string
}

export interface BudgetCategoryGroup {
  key: 'attention' | 'onTrack'
  rows: BudgetCategoryCardRow[]
}

interface BudgetCategoryListProps {
  groups: BudgetCategoryGroup[]
  selectedCategory: number | null
  toggleSelected: (id: number) => void
  activeCurrency: string
  /* Edit-plan props - all state lives in the page: the drafts map for the
     viewed currency (keyed `${categoryId}:${currencyCode}`), the shared
     draft change handler, and per-row server errors from a failed Save. A
     key present in the map = that row renders an input. */
  editDrafts: Record<string, string | undefined>
  onDraftChange: (key: string, value: string) => void
  rowErrors: Record<string, string>
}

/** Bar fill per the card spec's status table (NOT the page currency strip's
 *  severityFill, whose 95% split belongs to the strip): primary under 75%,
 *  warning at 75%+ without going over, negative over. Color lives on the bar. */
const fillClassOf = (status: BudgetCategoryCardRow['status']): string =>
  status === 'over' ? 'bg-negative' : status === 'near' ? 'bg-warning' : 'bg-primary'

/** Status-word and amount-left text color: negative on over rows, muted
 *  otherwise (see the status-row note below on the missing warning text
 *  color). */
const statusTextClass = (status: BudgetCategoryCardRow['status']): string =>
  status === 'over' ? 'text-negative' : 'text-text-muted'

/** Trailing-chevron Activity link: >=44x44 on coarse pointers via padding +
 *  pointer-coarse floors, modeled on the page's custom-cadence header
 *  buttons. */
const chevronLinkClass =
  'flex items-center justify-center p-1.5 rounded-none text-text-muted hover:text-text hover:bg-surface-hover transition-colors ' +
  'pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'

export default function BudgetCategoryList({
  groups,
  selectedCategory,
  toggleSelected,
  activeCurrency,
  editDrafts,
  onDraftChange,
  rowErrors,
}: BudgetCategoryListProps) {
  const { t } = useTranslation('budgets')

  return (
    <div className="space-y-3">
      {groups.map((group) =>
        group.rows.length === 0 ? null : (
          <div key={group.key}>
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted px-1 mb-1.5">
              {t(group.key === 'attention' ? 'detail.groupNeedsAttention' : 'detail.groupOnTrack')}
            </div>
            <div className="space-y-2">
              {group.rows.map((row) => {
                const { category, planned, actual, remaining, status, pct, activityUrl } = row
                const cellKey = `${category.id}:${activeCurrency}`
                const isSelected = selectedCategory === category.id
                const draft = editDrafts[cellKey]
                const statusWord = status === 'over' ? t('detail.statusOver') : status === 'near' ? t('detail.statusNearLimit') : null
                const statusColor = statusTextClass(status)
                return (
                  <div
                    key={category.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => toggleSelected(category.id)}
                    onKeyDown={(e: KeyboardEvent) => {
                      // Only when the card itself is focused - Enter/Space inside the
                      // batch planned inputs must keep native behavior.
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        toggleSelected(category.id)
                      }
                    }}
                    className={`bg-surface border rounded-sm p-3 cursor-pointer transition-colors ${isSelected ? 'border-border-focus' : 'border-border'}`}
                  >
                    {/* Row 1 per the card spec: name left, spent-of-planned
                        right, trailing chevron to the Activity list. Card body
                        is the highlight toggle - inner controls stop
                        propagation. */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-xs font-medium text-text min-w-0 truncate">{category.name}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {draft !== undefined ? (
                          /* Batch planned input while this row holds a draft;
                             the spent figure stays visible above it for
                             context. Clicks stop at the wrapper so the row
                             highlight toggle and the chevron link keep
                             working. text (not number) input: comma-decimal
                             typing reaches JS as text and the page
                             normalizes at the Save boundary. */
                          <span className="flex flex-col items-end" onClick={(e) => e.stopPropagation()}>
                            <span className="font-mono text-xs font-medium tabular-nums text-text whitespace-nowrap">
                              {formatAmount(actual)}
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={draft}
                              onChange={(e) => onDraftChange(cellKey, e.target.value)}
                              className="w-24 bg-surface-hover border border-border rounded-none px-2 py-1 font-mono text-xs tabular-nums text-text text-right focus:ring-2 focus:ring-border-focus focus:outline-hidden"
                            />
                            {rowErrors[cellKey] && <span className="text-negative text-xs mt-0.5 text-right">{rowErrors[cellKey]}</span>}
                          </span>
                        ) : (
                          <span className="font-mono text-xs font-medium tabular-nums text-text whitespace-nowrap">
                            {formatAmount(actual)}{' '}
                            <span className="text-[10px] text-text-muted">
                              {t('detail.ofAmount', { amount: formatAmount(planned) })}
                            </span>
                          </span>
                        )}
                        <Link
                          to={activityUrl}
                          aria-label={t('detail.viewCategoryActivity', { name: category.name })}
                          onClick={(e) => e.stopPropagation()}
                          className={chevronLinkClass}
                        >
                          <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
                        </Link>
                      </span>
                    </div>
                    {/* Progress bar: h-1 track, sharp corners, fill by status;
                        over rows clamp to a full bar. */}
                    <div aria-hidden="true" className="w-full h-1 bg-surface-muted rounded-none overflow-hidden mb-1.5">
                      <div
                        className={`block h-full rounded-none transition-all ${fillClassOf(status)}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    {/* Status row: the plain mono uppercase label is the phone
                        chip. Words only on attention rows - the On-track group
                        heading carries that status. Near limit stays
                        text-text-muted: the palette has no warning TEXT color
                        legible at this size yet - switch to a warning text
                        token when one lands. */}
                    <div className="flex justify-between text-[10px] font-mono font-medium uppercase tracking-wider">
                      {statusWord === null ? <span /> : <span className={statusColor}>{statusWord}</span>}
                      <span className={statusColor}>{t('detail.amountLeft', { amount: formatAmount(remaining) })}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ),
      )}
    </div>
  )
}
