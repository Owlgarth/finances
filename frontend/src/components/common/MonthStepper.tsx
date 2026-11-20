import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isCalendarMonth } from '../../utils/dates'
import { formatMonthYear, formatPeriodRange, formatQuickPickDate } from '../../utils/format'
import { controlHeightClass } from './formStyles'

interface Props {
  /** Pre-formatted range label ("October 2026" / "Dec 28 2025 - Jan 3
   *  2026" / "May 5" / "All time") - derived once per page through
   *  stepperRangeLabel so the stepper and any page-side caption (Planned's
   *  month-aware empty state) share one shape. */
  label: string
  /** Adjacent-month hop (+1 = next, -1 = previous). Pass it ONLY while the
   *  effective range is exactly one calendar month: the arrows render iff
   *  this prop is present, so the page's isCalendarMonth detection is the
   *  single gate (the handler itself also guards, belt-and-braces). */
  onShift?: (delta: number) => void
  /** Opens the date range editor. Optional: unwired on the standalone
   *  phone row's default use (no editor host there), wired by the 640+
   *  filter toolbar (the popover host) and by phone hosts that open a
   *  dialog surface. The label is deliberately a button in both stepper
   *  states so this handler can be attached (plus aria-haspopup and
   *  aria-expanded, keyed on its presence) without changing the control's
   *  shape. Without an exact-month range there is no other date entry
   *  point, so the label-button must exist everywhere. */
  onOpenEditor?: () => void
  /** True while the editor this label opens is open (aria-expanded). Only
   *  meaningful together with onOpenEditor. */
  editorOpen?: boolean
  /** Toolbar membership: the host row owns spacing and width, so this
   *  drops the component's own bottom margin and full-width phone claim
   *  (the standalone row keeps both by default). */
  inline?: boolean
}

/** The stepper label for an effective from/to range (both bounds '' when
 *  unset): the month name for an exact calendar month, the configured
 *  all-time wording when both bounds are empty, the short localized period
 *  range when both are set, and the single formatted bound for a partial
 *  range (a half-open range is a real user state - one bound deep-linked or
 *  cleared - and parseISO would throw on an empty bound). Month names and
 *  date shapes come from the date-fns locale / number-style config, never
 *  from i18n catalogs. */
export function stepperRangeLabel(from: string, to: string, allTimeLabel: string): string {
  if (isCalendarMonth(from, to)) return formatMonthYear(from)
  if (from === '' && to === '') return allTimeLabel
  if (from !== '' && to !== '') return formatPeriodRange(from, to)
  return formatQuickPickDate(from !== '' ? from : to, 'date')
}

/** Month stepper for the three Activity lists: prev/next chevrons around the
 *  range label when the range is exactly one calendar month, the label alone
 *  otherwise (custom ranges, partial ranges, All time). Purely
 *  presentational: the page derives the label and gates the arrows through
 *  the onShift prop.
 *
 *  The label is a button (the date-editor trigger) in BOTH states, with its
 *  accessible name on the button and the changing value announced by the
 *  visually-hidden polite sibling region - a live region must never be an
 *  interactive element. Both chevron buttons and the label button carry the
 *  focus-visible ring (a ring on every interactive element) and strokeWidth
 *  1.5 icons; the chevrons are w-8 h-8 with touch-hit; min-w-[128px] keeps
 *  the chevrons in place across locales' month-name widths, with
 *  max-sm:flex-1 absorbing the full-width mobile row. The monthNav aria
 *  strings live in the planned namespace (they predate the shared stepper)
 *  and are reused as-is; the date-range aria is a transactions-namespace
 *  shared-filter string. */
export default function MonthStepper({ label, onShift, onOpenEditor, editorOpen, inline }: Props) {
  const { t: tNav } = useTranslation('planned')
  const { t: tFilters } = useTranslation('transactions')
  // Hoisted: the literal-string lint recognizes only the unaliased t() callee.
  const groupAria = tNav('monthNav.groupAria')
  const prevAria = tNav('monthNav.prevAria')
  const nextAria = tNav('monthNav.nextAria')
  const dateRangeAria = tFilters('listFilters.dateRangeAria')
  return (
    <div
      className={`flex items-center gap-1${inline ? '' : ' mb-3 max-sm:w-full'}`}
      role="group"
      aria-label={groupAria}
    >
      {onShift && (
        <button
          type="button"
          onClick={() => onShift(-1)}
          aria-label={prevAria}
          className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={onOpenEditor}
        aria-label={dateRangeAria}
        aria-haspopup={onOpenEditor ? 'dialog' : undefined}
        aria-expanded={onOpenEditor ? (editorOpen ?? false) : undefined}
        className={`font-mono text-xs font-medium text-text min-w-[128px] text-center max-sm:flex-1 rounded-sm hover:bg-surface-hover transition-colors ${controlHeightClass} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus`}
      >
        {label}
      </button>
      {/* Visually-hidden polite sibling: announces the month/range while the
          button above keeps a stable accessible name (buttons must not be
          live regions). Exactly one such region lives in this component. */}
      <span className="sr-only" aria-live="polite">{label}</span>
      {onShift && (
        <button
          type="button"
          onClick={() => onShift(1)}
          aria-label={nextAria}
          className="w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
