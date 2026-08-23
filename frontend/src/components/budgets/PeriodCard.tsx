import { Link } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { usePermissions } from '../../hooks/usePermissions'
import { formatPeriodRange } from '../../utils/format'
import type { Period } from '../../types'

/** Temporal classification of a period against today - byte-equivalent copy
 *  of PeriodPicker's module-private temporalOf (same string-compare idiom as
 *  BudgetDetailPage's isPast/isFuture: ISO yyyy-MM-dd strings compare
 *  chronologically as plain strings). Not exported there, so copied here;
 *  keep the bodies identical if either changes. */
type Temporal = 'past' | 'current' | 'future'

function temporalOf(period: Period, todayIso: string): Temporal {
  if (period.end_date < todayIso) return 'past'
  if (period.start_date > todayIso) return 'future'
  return 'current'
}

/** CURRENT tag - class string verbatim from PeriodPicker's CurrentChip
 *  (module-private there; copied, not extracted - two consumers do not
 *  justify churning the picker in this task). The bg-surface fill keeps it
 *  legible over the card's hover bg. No icon. */
function CurrentChip() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none flex-shrink-0">
      CURRENT
    </span>
  )
}

interface PeriodCardProps {
  period: Period
  budgetId: number
  /** Open the edit modal for this period (custom periods only - the card
   *  already gates the icons on is_custom, so these fire only for custom). */
  onEdit: (period: Period) => void
  /** Open the delete confirm dialog for this period. */
  onDelete: (period: Period) => void
}

/**
 * One budget period as a card on the periods page. The whole card is a Link
 * to the budget detail page seeded with ?period=<id> (PR #84 deep link - the
 * detail page reads it on mount), so keyboard activation and the focus ring
 * come free. Card classes mirror BudgetsPage's budget card (bg-only hover;
 * borders are structural, so no border-color shift on hover). Temporal
 * muting is TEXT ONLY (picker vocabulary): past name text-text-muted, past
 * range text-text-muted/60, no background tint; hover still applies.
 *
 * Edit/delete icons appear ONLY on is_custom periods for admins: the backend
 * raises PeriodNotEditableError on update AND delete of auto-created periods
 * (budgeting/services.py), so auto-created periods render no dead buttons.
 * Adjacent icon buttons (BudgetsPage pattern): real padded hit areas instead
 * of .touch-hit (expanded areas would overlap); on coarse pointers they grow
 * to the 44px floor, -my-3 keeps the card header height unchanged.
 *
 * Zero state, zero effects - lint-quiet by construction.
 */
export default function PeriodCard({ period, budgetId, onEdit, onDelete }: PeriodCardProps) {
  const { canManageAccounts } = usePermissions()
  // Page idiom (PeriodPicker line 257 / BudgetDetailPage line 245): UTC ISO
  // date string computed per render, compared against the period's ISO dates.
  const todayIso = new Date().toISOString().slice(0, 10)
  const temporal = temporalOf(period, todayIso)
  // Custom periods are admin-manageable; auto-created ones are immutable history.
  const canManagePeriod = period.is_custom && canManageAccounts

  return (
    <Link
      to={`/budgets/${budgetId}?period=${period.id}`}
      className="border border-border rounded-sm bg-surface p-4 hover:bg-surface-hover active:bg-surface-hover transition-colors"
    >
      <div className="flex items-center gap-2">
        <span
          className={
            'text-sm font-medium truncate ' + (temporal === 'past' ? 'text-text-muted' : 'text-text')
          }
        >
          {period.name}
        </span>
        {temporal === 'current' && <CurrentChip />}
        {canManagePeriod && (
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onEdit(period)
              }}
              title={`Edit period ${period.name}`}
              aria-label={`Edit period ${period.name}`}
              className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-text"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDelete(period)
              }}
              title={`Delete period ${period.name}`}
              aria-label={`Delete period ${period.name}`}
              className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-negative"
            >
              <Trash2 size={13} />
            </button>
          </span>
        )}
      </div>
      <div
        className={
          'mt-2 font-mono text-[11px] ' + (temporal === 'past' ? 'text-text-muted/60' : 'text-text-muted')
        }
      >
        {formatPeriodRange(period.start_date, period.end_date)}
      </div>
    </Link>
  )
}
