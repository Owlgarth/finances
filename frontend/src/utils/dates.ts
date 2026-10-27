// Local-date period math shared by the Transactions/Planned/Transfers list
// pages: ISO-date rendering that never crosses into UTC, whole-month /
// whole-week / whole-year ranges, and the calendar-month detection/stepping
// the Planned month focus builds on. All values are local dates as
// yyyy-MM-dd - the from/to URL param shape.

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

/** The calendar week containing `date`: startDay through startDay+6, where
 *  startDay is the calendar-start-day preference shape (1 = Monday ..
 *  7 = Sunday). Month rollovers ride Date math like monthRange.
 *
 * Worked examples (docblock examples are the review contract):
 *   weekRange(new Date(2026, 9, 27), 1) === { from: '2026-10-26', to: '2026-11-01' }  // Tuesday, weeks start Monday
 *   weekRange(new Date(2026, 9, 27), 7) === { from: '2026-10-25', to: '2026-10-31' }  // same day, weeks start Sunday
 *   weekRange(new Date(2026, 11, 1), 1) === { from: '2026-11-30', to: '2026-12-06' }  // crosses the month
 */
export function weekRange(date: Date, startDay: number): { from: string; to: string } {
  // 1..7 ISO weekday -> 0..6 JS weekday (7 = Sunday = 0), the same
  // conversion DatePicker applies to calendar_start_day.
  const jsStart = startDay === 7 ? 0 : startDay
  const shift = (date.getDay() - jsStart + 7) % 7
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift)
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6)
  return { from: toIsoDate(from), to: toIsoDate(to) }
}

/** First-to-last day of `date`'s calendar year - whole-period discipline
 *  (year ends included), matching the This-year filter preset's range.
 *
 * Worked examples:
 *   yearRange(new Date(2026, 9, 27)) === { from: '2026-01-01', to: '2026-12-31' }
 */
export function yearRange(date: Date): { from: string; to: string } {
  const year = date.getFullYear()
  return { from: `${year}-01-01`, to: `${year}-12-31` }
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
