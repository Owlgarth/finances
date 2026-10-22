// Local-date month math shared by the Transactions/Planned list pages:
// ISO-date rendering that never crosses into UTC, whole-month ranges, and
// the calendar-month detection/stepping the Planned month focus builds
// on. All values are local dates as yyyy-MM-dd - the from/to URL param shape.

/** Local calendar date as YYYY-MM-DD. Never toISOString() - it renders the
    UTC day, which can sit a day off either end of a local-date range. */
export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** First-to-last day of a month; out-of-range months roll over (Date math). */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: toIsoDate(new Date(year, month, 1)),
    to: toIsoDate(new Date(year, month + 1, 0)),
  }
}

/** A calendar-month address. `month` is 0-based like Date#getMonth:
 *  { year: 2026, month: 9 } is October 2026. */
export interface CalendarMonth {
  year: number
  month: number
}

/**
 * If a from/to range spans exactly one calendar month, its {year, month}
 * address; null for anything else (multi-month ranges, partial months,
 * manually edited bounds, unset or garbage strings).
 *
 * Round-trip check: parse year/month out of `from`, rebuild the whole
 * month through monthRange (whose Date math normalizes out-of-range
 * values, so e.g. a month of 12 becomes next January and fails the
 * comparison), and require BOTH bounds to match - the returned address
 * is exact by construction.
 *
 * Worked examples (docblock examples are the review contract - the
 * frontend has no test runner):
 *   isCalendarMonth('2026-10-01', '2026-10-31') === { year: 2026, month: 9 }
 *   isCalendarMonth('2028-02-01', '2028-02-29') === { year: 2028, month: 1 }  // leap year
 *   isCalendarMonth('2026-10-01', '2026-11-30') === null                       // two months
 *   isCalendarMonth('2026-10-03', '2026-10-31') === null                       // partial month
 *   isCalendarMonth('', '') === null                                           // unset params
 */
export function isCalendarMonth(from: string, to: string): CalendarMonth | null {
  const year = Number(from.slice(0, 4))
  const month = Number(from.slice(5, 7)) - 1
  const range = monthRange(year, month)
  return range.from === from && range.to === to ? { year, month } : null
}

/**
 * The whole-month range `delta` months away from `month`: the stepper's
 * adjacent-month hop (delta -1 / +1). Built on monthRange's rollover, so
 * December -> January crosses the year boundary and any integer delta
 * works.
 *
 * Worked examples:
 *   shiftMonth({ year: 2026, month: 9 }, 1)  === { from: '2026-11-01', to: '2026-11-30' }
 *   shiftMonth({ year: 2026, month: 11 }, 1) === { from: '2027-01-01', to: '2027-01-31' }
 *   shiftMonth({ year: 2027, month: 0 }, -1) === { from: '2026-12-01', to: '2026-12-31' }
 */
export function shiftMonth(month: CalendarMonth, delta: number): { from: string; to: string } {
  return monthRange(month.year, month.month + delta)
}
