import { useTranslation } from 'react-i18next'
import type { PlannedTransaction } from '../../types'
import { toIsoDate } from '../../utils/dates'

interface Props {
  planned: PlannedTransaction
}

type ChipStatus = 'upcoming' | 'overdue' | 'paid' | 'skipped'

// Literal keys, so the translator checks each one against the catalog.
const STATUS_KEY = {
  upcoming: 'record.status.upcoming',
  overdue: 'record.status.overdue',
  paid: 'record.status.paid',
  skipped: 'record.status.skipped',
} as const

// Exactly one text color per status: two color utilities on one element are
// resolved by stylesheet order, not class order. The word keeps the normal
// text color on every tint; color alone must not carry the meaning.
const STATUS_CLASS: Record<ChipStatus, string> = {
  upcoming: 'bg-surface border-border text-text',
  overdue: 'bg-warning-bg border-warning/20 text-text',
  paid: 'bg-positive-bg border-positive/20 text-text',
  skipped: 'bg-surface border-border text-text-muted',
}

const CHIP_BASE =
  'inline-flex items-center px-2 py-0.5 border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider select-none'

/** One status chip for a planned item, shared by the list row and the record
 *  so the two can never disagree. Overdue is derived, never stored: a
 *  pending item dated before the local today is overdue. */
export default function PlannedStatusChip({ planned }: Props) {
  const { t } = useTranslation('planned')
  // The local date is read at render, never at module scope, so the chip is
  // still right after a day rollover in a long-lived tab.
  const status: ChipStatus =
    planned.status === 'done' ? 'paid'
    : planned.status === 'cancelled' ? 'skipped'
    : planned.planned_date < toIsoDate(new Date()) ? 'overdue'
    : 'upcoming'
  return <span className={`${CHIP_BASE} ${STATUS_CLASS[status]}`}>{t(STATUS_KEY[status])}</span>
}
