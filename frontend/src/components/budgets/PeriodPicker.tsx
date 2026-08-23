import { Fragment, useEffect, useRef } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useListboxPanel } from '../../hooks/useListboxPanel'
import { formatPeriodRange } from '../../utils/format'
import type { Period } from '../../types'
import BottomSheet from '../common/BottomSheet'
import { listboxTriggerBaseClass } from '../common/listboxParts'

export interface PeriodPickerProps {
  /** The host page's allPeriods (list + currentPeriod merged, newest first).
   *  No fetching inside the picker - it renders what it is given. */
  periods: Period[]
  /** Selected period id (controlled). `null` shows the placeholder. */
  value: number | null
  /** Fires with the chosen period id on row activation; the picker closes itself. */
  onChange: (id: number) => void
  /** Accessible name for the trigger (spec §2). Panels are labeled "Periods". */
  'aria-label'?: string
}

/** Temporal classification of a period against today (spec §6). */
type Temporal = 'past' | 'current' | 'future'

/** Same string-compare idiom as BudgetDetailPage's isPast/isFuture: ISO
 *  yyyy-MM-dd strings compare chronologically as plain strings. */
function temporalOf(period: Period, todayIso: string): Temporal {
  if (period.end_date < todayIso) return 'past'
  if (period.start_date > todayIso) return 'future'
  return 'current'
}

/** One period with its hook-aligned flat option index baked in (see the
 *  groups computation in the component). */
interface PeriodGroupItem {
  period: Period
  index: number
}

interface PeriodGroup {
  year: string
  items: PeriodGroupItem[]
}

/** Composed accessible label (spec §7.3): the visual row omits the year (the
 *  group label carries it) and truncates long names, so the button's label
 *  always carries BOTH endpoints with years plus ", current" when temporal is
 *  current. `aria-selected` remains the selection signal. */
function optionAriaLabel(period: Period, todayIso: string): string {
  const range = formatPeriodRange(period.start_date, period.end_date, { withYears: true })
  return `${period.name}, ${range}` + (temporalOf(period, todayIso) === 'current' ? ', current' : '')
}

/** §8 CURRENT tag - the components.md §10 neutral chip, class string verbatim.
 *  The bg-surface fill keeps it legible on surface-muted (selected) and
 *  surface-hover (hovered) rows. No icon. */
function CurrentChip() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none flex-shrink-0">
      CURRENT
    </span>
  )
}

interface DesktopRowProps {
  /** aria-activedescendant target id from the hook's optionId(i). */
  id: string
  period: Period
  selected: boolean
  highlighted: boolean
  todayIso: string
  onActivate: () => void
}

/**
 * Desktop popover row (spec §4.3): 32px single line, patterns.md §5 menu-item
 * anatomy (px-3 gap-2.5 text-[13px], Check 14px / w-3.5 spacer - deviation 2).
 * Row state composition (spec §6): selected = bg-surface-muted + font-medium +
 * leading Check with NO hover swap (listboxParts parity - a hover swap would
 * recreate the indistinguishable-from-hover problem); keyboard highlight =
 * bg-surface-hover; plain rows (including past) get hover:bg-surface-hover.
 * Temporal muting is TEXT ONLY: past name text-text-muted, past range
 * text-text-muted/60; no background tint. Selection and current compose:
 * a selected current period renders check + bg + chip.
 */
function DesktopPeriodRow({ id, period, selected, highlighted, todayIso, onActivate }: DesktopRowProps) {
  const temporal = temporalOf(period, todayIso)
  return (
    <button
      type="button"
      role="option"
      id={id}
      aria-selected={selected}
      aria-label={optionAriaLabel(period, todayIso)}
      tabIndex={-1}
      onClick={onActivate}
      className={
        'w-full flex items-center gap-2.5 px-3 h-8 text-left text-[13px] transition-colors ' +
        (selected
          ? 'font-medium bg-surface-muted '
          : highlighted
            ? 'bg-surface-hover '
            : 'hover:bg-surface-hover ')
      }
    >
      {selected ? (
        <Check size={14} className="text-primary flex-shrink-0" />
      ) : (
        <span className="w-3.5 flex-shrink-0" />
      )}
      <span
        className={'flex-1 min-w-0 truncate ' + (temporal === 'past' ? 'text-text-muted' : 'text-text')}
      >
        {period.name}
      </span>
      <span
        className={
          'font-mono text-[11px] flex-shrink-0 ' +
          (temporal === 'past' ? 'text-text-muted/60' : 'text-text-muted')
        }
      >
        {formatPeriodRange(period.start_date, period.end_date)}
      </span>
      {temporal === 'current' && <CurrentChip />}
    </button>
  )
}

interface SheetRowProps {
  period: Period
  selected: boolean
  todayIso: string
  onActivate: () => void
}

/**
 * Mobile sheet row (spec §5.3): two lines, min-h-[44px] (natural ~48px),
 * SheetOptionRow parity for the leading slot (Check 16px / w-4 spacer) and
 * press feedback (active:bg-surface-hover - no hover on touch). Selection is
 * row-level (font-medium + bg-surface-muted + Check); the CURRENT chip is
 * line-2-right. Line 2 uses justify-between so the range may truncate
 * (min-w-0) while the chip never does (flex-shrink-0).
 */
function SheetPeriodRow({ period, selected, todayIso, onActivate }: SheetRowProps) {
  const temporal = temporalOf(period, todayIso)
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={optionAriaLabel(period, todayIso)}
      onClick={onActivate}
      className={
        'w-full min-h-[44px] px-4 py-2 flex items-center gap-3 text-left text-sm transition-colors active:bg-surface-hover ' +
        (selected ? 'font-medium bg-surface-muted ' : '')
      }
    >
      {selected ? (
        <Check size={16} className="text-primary flex-shrink-0" />
      ) : (
        <span className="w-4 flex-shrink-0" />
      )}
      <span className="flex-1 min-w-0">
        <span
          className={'block truncate ' + (temporal === 'past' ? 'text-text-muted' : 'text-text')}
        >
          {period.name}
        </span>
        <span className="flex items-center justify-between gap-2 mt-0.5">
          <span
            className={
              'font-mono text-[11px] min-w-0 truncate ' +
              (temporal === 'past' ? 'text-text-muted/60' : 'text-text-muted')
            }
          >
            {formatPeriodRange(period.start_date, period.end_date)}
          </span>
          {temporal === 'current' && <CurrentChip />}
        </span>
      </span>
    </button>
  )
}

/**
 * Budget period overview picker (PERIOD_PICKER_SPEC.md) - a SIBLING CONSUMER
 * of useListboxPanel alongside Select/MultiSelect, not a fork: shared trigger
 * + open/highlight/type-ahead machinery, picker-specific rich rows (name +
 * date range + CURRENT chip) grouped by year, temporal muting, composed
 * per-option aria-labels. Intentional deviations from listboxParts defaults
 * are the 8 items in spec §12. Not yet wired into any page (Task 3 does it);
 * selection semantics identical to Select (pick and close, no toggle-off).
 */
export default function PeriodPicker({
  periods,
  value,
  onChange,
  'aria-label': ariaLabel = 'Period',
}: PeriodPickerProps) {
  // Adaptive pattern (patterns.md §13): all panel state lives in
  // useListboxPanel above the variant branches, so a resize mid-open loses
  // nothing. Desktop = anchored popover, mobile = BottomSheet.
  const { isMobile } = useBreakpoint()

  // Deviation 7: options are { value: id, label: name } so the hook's
  // type-ahead and filtering stay honest; rich rows look the full Period up
  // from `periods` by flat index. Deviation 6: searchable: false - the search
  // input is deferred; printable-letter type-ahead still works (labels carry
  // the period names).
  const options = periods.map((p) => ({ value: p.id, label: p.name }))
  const selectedIndex = periods.findIndex((p) => p.id === value)
  const selectedPeriod = selectedIndex >= 0 ? periods[selectedIndex] : null

  // Desktop popover ref - the hook has no desktop panel ref; scroll-into-view
  // on open is done locally (deviation 5), NOT by extending the hook (which
  // would change Select/MultiSelect behavior).
  const panelRef = useRef<HTMLDivElement>(null)

  // `activateIndex` below is a hoisted function declaration, so referencing
  // it here is safe: it is only invoked from event handlers after render, by
  // which time the hook returns its body closes over are initialized (no TDZ
  // at call time) - same note as Select.
  const {
    open,
    setOpen,
    highlightedIndex,
    filteredOptions,
    wrapperRef,
    triggerRef,
    sheetListRef,
    optionId,
    openPanel,
    closePanel,
    handleTriggerKeyDown,
  } = useListboxPanel({
    options,
    searchable: false,
    disabled: false,
    isMobile,
    initialHighlightIndex: selectedIndex >= 0 ? selectedIndex : 0,
    onActivate: activateIndex,
  })

  // Pick the period and close - identical semantics to Select's selectIndex:
  // re-clicking the already-selected row just closes; no toggle-off.
  // With searchable: false, filteredOptions === options === periods in order,
  // so the index into filteredOptions doubles as a `periods` index.
  function activateIndex(i: number) {
    const opt = filteredOptions[i]
    if (!opt) return
    onChange(opt.value)
    closePanel(true)
  }

  // Page idiom (BudgetDetailPage lines 170-172): UTC ISO date string compared
  // against the periods' ISO date strings.
  const todayIso = new Date().toISOString().slice(0, 10)

  // Group by start year IN LIST ORDER (newest first - the page already
  // sorted allPeriods by start_date desc, so years are monotonically
  // non-increasing and equal years are adjacent; no resorting here). The
  // reduce's third argument IS each period's flat option index: with
  // searchable: false the hook's filteredOptions === options === periods, so
  // optionId(item.index) and aria-activedescendant stay aligned with the
  // hook's index space while labels/dividers interleave options freely -
  // keyboard skips them naturally because the hook only counts options.
  const groups = periods.reduce<PeriodGroup[]>((acc, period, index) => {
    const year = period.start_date.slice(0, 4)
    const last = acc[acc.length - 1]
    if (last && last.year === year) last.items.push({ period, index })
    else acc.push({ year, items: [{ period, index }] })
    return acc
  }, [])

  // Desktop scroll-into-view on open (spec §9, deviation 5): center the
  // initially highlighted row (= the selected period via
  // initialHighlightIndex, falling back to the first option when nothing is
  // selected) INSTANTLY. Manual scrollTop math, NOT element.scrollIntoView -
  // scrollIntoView scrolls every scrollable ancestor, dragging the page under
  // the popover. Lint note: this effect only mutates DOM (scrollTop); it
  // contains no setState call, so react-hooks/set-state-in-effect stays
  // quiet and the 19-warning baseline is preserved.
  useEffect(() => {
    if (!open || isMobile) return
    const panel = panelRef.current
    if (!panel) return
    const row =
      panel.querySelector<HTMLElement>('[aria-selected="true"]') ??
      panel.querySelector<HTMLElement>('[role="option"]')
    if (!row) return
    // row.offsetTop is measured against the row's offsetParent - the panel
    // itself: the panel is position:absolute (a positioned ancestor for its
    // static-position children) AND the scroll container (overflow-y-auto),
    // so panel-coordinate centering is exactly this arithmetic.
    panel.scrollTop = row.offsetTop - panel.clientHeight / 2 + row.clientHeight / 2
  }, [open, isMobile])

  // Deviation 1: spec §4.1 panel classes verbatim + w-72 + left-0 +
  // animate-fade-in (Step 2's utility). NOT listboxPanelClass - it is w-full
  // (tied to the w-56 trigger), while the three-field row needs ~270px. Note
  // py-1 is in spec §4.1 but absent from listboxPanelClass - keep it.
  const panelClass =
    'absolute z-dropdown mt-1 left-0 w-72 ' +
    'bg-surface border border-border rounded-sm py-1 ' +
    'max-h-[280px] overflow-y-auto ' +
    'animate-fade-in'

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-activedescendant={
          open && !isMobile && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined
        }
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        className={listboxTriggerBaseClass}
      >
        <span className={value == null ? 'truncate text-text-muted' : 'truncate'}>
          {selectedPeriod ? selectedPeriod.name : 'Select period'}
        </span>
        <ChevronDown
          size={12}
          className={'text-text-muted flex-shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
        />
      </button>

      {/* Mobile panel: BottomSheet of two-line rows, integrated exactly like
          Select's - rendered whenever isMobile (NOT gated on `open`) so the
          sheet can play its exit animation. Scroll-into-view on open is
          inherited from the hook's sheetListRef effect. No sheet title; the
          dialog and the listbox are both labeled "Periods" (spec §5.1). */}
      {isMobile && (
        <BottomSheet open={open} onClose={() => closePanel(true)} aria-label="Periods">
          <div ref={sheetListRef} role="listbox" aria-label="Periods" className="pb-1">
            {groups.map((group, gi) => (
              <Fragment key={group.year}>
                {gi > 0 && <div className="h-px bg-border my-1 mx-2" aria-hidden="true" />}
                <div
                  className="px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted/60"
                  aria-hidden="true"
                >
                  {group.year}
                </div>
                {group.items.map((item) => (
                  <SheetPeriodRow
                    key={item.period.id}
                    period={item.period}
                    selected={item.period.id === value}
                    todayIso={todayIso}
                    onActivate={() => activateIndex(item.index)}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* Desktop panel: anchored popover, keyboard nav + type-ahead inherited
          from the hook. Group labels px-3 on desktop (§4.2), dividers between
          groups only, both aria-hidden - years travel in each option's
          composed aria-label (deviation 8). */}
      {open && !isMobile && (
        <div ref={panelRef} role="listbox" aria-label="Periods" className={panelClass}>
          {groups.map((group, gi) => (
            <Fragment key={group.year}>
              {gi > 0 && <div className="h-px bg-border my-1 mx-2" aria-hidden="true" />}
              <div
                className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted/60"
                aria-hidden="true"
              >
                {group.year}
              </div>
              {group.items.map((item) => (
                <DesktopPeriodRow
                  key={item.period.id}
                  id={optionId(item.index)}
                  period={item.period}
                  selected={item.period.id === value}
                  highlighted={item.index === highlightedIndex}
                  todayIso={todayIso}
                  onActivate={() => activateIndex(item.index)}
                />
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
