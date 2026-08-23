import { Fragment, useEffect, useRef } from 'react'
import { CalendarRange, Check, ChevronDown } from 'lucide-react'
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
  /** Max period rows shown: the list is windowed to `limit` rows centered on
   *  the selected/viewed period (clamped at the list edges; a null selection
   *  starts at the top). Undefined = no cap (full list). Optional variant
   *  prop - existing call sites that omit it are unaffected. */
  limit?: number
  /** When provided, a "View all periods" pseudo-option is appended last in
   *  BOTH panels; activating it fires this (instead of onChange) and closes
   *  the picker. The row is always visible - not conditional on list length. */
  onViewAll?: () => void
  /** Accessible name for the trigger (spec §2). Panels are labeled "Periods". */
  'aria-label'?: string
}

/** Value of the "View all periods" pseudo-option appended to the hook's
 *  options. A NUMBER (not a string sentinel) keeps the hook's generic
 *  ListboxOption<number> shape honest; period ids are positive DB primary
 *  keys, so -1 can never collide with a real period. Module-private: callers
 *  pass `onViewAll`, never the sentinel. */
const VIEW_ALL_VALUE = -1
const VIEW_ALL_LABEL = 'View all periods'

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
 * are the 8 items in spec §12. Hosted by BudgetDetailPage's period switcher;
 * selection semantics identical to Select (pick and close, no toggle-off).
 * Optional variant props: `limit` caps the list to a window centered on the
 * selected/viewed period, and `onViewAll` appends a "View all periods"
 * pseudo-option (sticky footer in the desktop popover, last row in the
 * mobile sheet) that fires it instead of onChange and closes.
 */
export default function PeriodPicker({
  periods,
  value,
  onChange,
  limit,
  onViewAll,
  'aria-label': ariaLabel = 'Period',
}: PeriodPickerProps) {
  // Adaptive pattern (patterns.md §13): all panel state lives in
  // useListboxPanel above the variant branches, so a resize mid-open loses
  // nothing. Desktop = anchored popover, mobile = BottomSheet.
  const { isMobile } = useBreakpoint()

  // Deviation 7: options are { value: id, label: name } so the hook's
  // type-ahead and filtering stay honest; rich rows look the full Period up
  // by flat index. Deviation 6: searchable: false - the search input is
  // deferred; printable-letter type-ahead still works (labels carry the
  // period names, and the view-all pseudo-option's label matches it too).
  const selectedIndex = periods.findIndex((p) => p.id === value)
  const selectedPeriod = selectedIndex >= 0 ? periods[selectedIndex] : null

  // Capped window (variant props): pure per-render derivation - NO state, NO
  // effect, so react-hooks/set-state-in-effect stays quiet. When `limit` is
  // provided and the list exceeds it, show `limit` rows centered on the
  // selected/viewed period:
  //   windowStart = clamp(selectedIndex - floor(limit / 2), 0, periods.length - limit)
  // A null selection (or a list that fits) starts at the top / shows
  // everything. Clamping only moves the window TOWARD an existing selection,
  // so selectedIndex is guaranteed to fall INSIDE the window (proof: the
  // unclamped center puts it at offset floor(limit/2); each clamp direction
  // pins an edge that still contains it).
  const effectiveLimit = limit != null && periods.length > limit ? limit : null
  const windowStart =
    effectiveLimit != null
      ? Math.max(
          0,
          Math.min(
            selectedIndex >= 0 ? selectedIndex - Math.floor(effectiveLimit / 2) : 0,
            periods.length - effectiveLimit,
          ),
        )
      : 0
  const windowedPeriods =
    effectiveLimit != null ? periods.slice(windowStart, windowStart + effectiveLimit) : periods

  // The pseudo-option is appended LAST so arrows / Home / End / type-ahead
  // treat it as an ordinary option: End lands on it, Enter on it navigates,
  // typing "v" jumps to it (unless an earlier windowed period name also
  // starts with "v" - type-ahead is first-match; uniform participation is
  // accepted design). With searchable: false, filteredOptions === options.
  const options = [
    ...windowedPeriods.map((p) => ({ value: p.id, label: p.name })),
    ...(onViewAll ? [{ value: VIEW_ALL_VALUE, label: VIEW_ALL_LABEL }] : []),
  ]
  // Flat index of the pseudo-option in the hook's option space; -1 = absent.
  const viewAllIndex = onViewAll ? windowedPeriods.length : -1
  // Window-relative index of the selection (identical to selectedIndex when
  // uncapped - windowStart is 0). Always >= 0 when a selection exists.
  const selectedWindowIndex = selectedIndex >= 0 ? selectedIndex - windowStart : -1

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
    initialHighlightIndex: selectedWindowIndex >= 0 ? selectedWindowIndex : 0,
    onActivate: activateIndex,
  })

  // Pick the period and close - identical semantics to Select's selectIndex:
  // re-clicking the already-selected row just closes; no toggle-off.
  // With searchable: false, filteredOptions === options: the first
  // windowedPeriods.length entries are the windowed periods in order, and a
  // final entry (when onViewAll is provided) is the view-all pseudo-option.
  // So the index into filteredOptions doubles as a windowedPeriods index -
  // or addresses the pseudo-option when it equals viewAllIndex.
  function activateIndex(i: number) {
    const opt = filteredOptions[i]
    if (!opt) return
    if (opt.value === VIEW_ALL_VALUE) {
      onViewAll?.()
      closePanel(true)
      return
    }
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
  // searchable: false the hook's filteredOptions === options (windowed
  // periods first, optional pseudo-option last), so optionId(item.index)
  // and aria-activedescendant stay aligned with the hook's index space
  // while labels/dividers interleave options freely - keyboard skips them
  // naturally because the hook only counts options. The pseudo-option is
  // NOT in the groups; it renders separately after them at viewAllIndex.
  const groups = windowedPeriods.reduce<PeriodGroup[]>((acc, period, index) => {
    const year = period.start_date.slice(0, 4)
    const last = acc[acc.length - 1]
    if (last && last.year === year) last.items.push({ period, index })
    else acc.push({ year, items: [{ period, index }] })
    return acc
  }, [])

  // Desktop scroll-into-view on open (spec §9, deviation 5): center the
  // initially highlighted row (= the selected period via
  // initialHighlightIndex, falling back to the first option when nothing is
  // selected) INSTANTLY. Manual scrollTop math, NOT the DOM scroll-into-view
  // API - that call scrolls every scrollable ancestor, dragging the page
  // under the popover. Lint note: this effect only mutates DOM (scrollTop); it
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
            {/* Same view-all pseudo-option in the sheet's listbox: plain
                SheetOptionRow-parity row (44px floor, CalendarRange leading),
                not a sticky footer - the sheet has no 280px cap. */}
            {onViewAll && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                aria-label={VIEW_ALL_LABEL}
                onClick={() => activateIndex(viewAllIndex)}
                className="w-full min-h-[44px] px-4 flex items-center gap-3 text-left text-sm text-text transition-colors active:bg-surface-hover"
              >
                <CalendarRange size={16} className="text-text-muted flex-shrink-0" />
                <span className="truncate">{VIEW_ALL_LABEL}</span>
              </button>
            )}
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
          {/* View-all pseudo-option as a PINNED FOOTER: in-flow after 7 rows
              it lands below the 280px scroll fold, so it sticks to the panel's
              visible bottom instead - always visible without raising the
              shared max-h (spec §9). role="option" + optionId(viewAllIndex)
              keep it inside the hook's option space: ArrowDown/End/type-ahead
              reach it, aria-activedescendant can point at it, Enter/click
              activate it (activateIndex branch). aria-selected={false}: it is
              a navigation action, never the selected period. */}
          {onViewAll && (
            <button
              type="button"
              role="option"
              id={optionId(viewAllIndex)}
              aria-selected={false}
              aria-label={VIEW_ALL_LABEL}
              tabIndex={-1}
              onClick={() => activateIndex(viewAllIndex)}
              className={
                'sticky bottom-0 z-10 mt-1 border-t border-border transition-colors ' +
                'w-full flex items-center gap-2.5 px-3 h-8 text-left text-[13px] text-text ' +
                (highlightedIndex === viewAllIndex ? 'bg-surface-hover ' : 'bg-surface hover:bg-surface-hover ')
              }
            >
              <CalendarRange size={14} className="text-text-muted flex-shrink-0" />
              <span className="flex-1 min-w-0 truncate">{VIEW_ALL_LABEL}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
