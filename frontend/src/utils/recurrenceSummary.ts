import { formatFullDate } from './format'
import type { RecurringTransaction } from '../types'

/** Day-of-month of an ISO yyyy-MM-dd string (0 when blank) - feeds the
 *  monthly sentences and the clamp hint for start days that short months
 *  cannot carry. */
const dayOfMonth = (iso: string): number => (iso.length >= 10 ? Number(iso.slice(8, 10)) : 0)

/** A date in words through the configured date style and locale; a blank
 *  date stays blank, so a cleared end date never throws at render. */
const words = (iso: string): string => (iso ? formatFullDate(iso) : '')

/** The parts of the plain-language sentence that restates a rule's schedule.
 *  `key` names one of six catalog sentences (recurring.summary.*); `count`
 *  is the interval count the sentence pluralizes on; `day` is the start
 *  date's day of month (only the monthly sentences interpolate it); `start`
 *  and `end` are the dates in words, `end` blank without an end date.
 *  Translation stays with the caller: ONE t(key, parts) call lets `count`
 *  pick the plural form, so every language's forms come from its catalog.
 *
 *  The six sentences are resolved through a variable, which the key finder
 *  cannot follow, so they are listed here in its namespace-qualified form:
 *  'planned:recurring.summary.daily_noEnd', 'planned:recurring.summary.daily_withEnd',
 *  'planned:recurring.summary.weekly_noEnd', 'planned:recurring.summary.weekly_withEnd',
 *  'planned:recurring.summary.monthly_noEnd', 'planned:recurring.summary.monthly_withEnd'.
 *  They leave the catalogs only together with this module. */
export interface RecurrenceSummary {
  key:
    | 'recurring.summary.daily_noEnd'
    | 'recurring.summary.daily_withEnd'
    | 'recurring.summary.weekly_noEnd'
    | 'recurring.summary.weekly_withEnd'
    | 'recurring.summary.monthly_noEnd'
    | 'recurring.summary.monthly_withEnd'
  count: number
  day: number
  start: string
  end: string
}

/** The six catalog sentences, by unit and by whether the rule ends. */
const SUMMARY_KEYS: Record<
  RecurringTransaction['interval_kind'],
  Record<'noEnd' | 'withEnd', RecurrenceSummary['key']>
> = {
  daily: { noEnd: 'recurring.summary.daily_noEnd', withEnd: 'recurring.summary.daily_withEnd' },
  weekly: { noEnd: 'recurring.summary.weekly_noEnd', withEnd: 'recurring.summary.weekly_withEnd' },
  monthly: { noEnd: 'recurring.summary.monthly_noEnd', withEnd: 'recurring.summary.monthly_withEnd' },
}

/**
 * Turn a rule's schedule fields into the parts of its summary sentence.
 * Pure: no React, no translation - the caller renders
 * t(summary.key, { count, day, start, end }) and i18next picks the plural
 * form from `count`. An empty or invalid interval count (not a whole number
 * from 1 to 365, the bounds the form validates) reads as the count-1
 * sentence; the form's own interval error explains the field. The two
 * bound checks must stay in step.
 *
 * Worked examples (docblock examples are the contract - the frontend has
 * no test runner, so they are the review reference; keep them in sync if
 * the behavior ever changes). Dates below assume the en number style and
 * the enUS locale, the defaults:
 *   recurrenceSummary({ intervalKind: 'daily', intervalCount: '1', startDate: '2026-11-17', endDate: '' })
 *     === { key: 'recurring.summary.daily_noEnd', count: 1, day: 17, start: 'Nov 17 2026', end: '' }
 *   recurrenceSummary({ intervalKind: 'monthly', intervalCount: '3', startDate: '2026-11-29', endDate: '2027-03-31' })
 *     === { key: 'recurring.summary.monthly_withEnd', count: 3, day: 29, start: 'Nov 29 2026', end: 'Mar 31 2027' }
 *   recurrenceSummary({ intervalKind: 'weekly', intervalCount: '12', startDate: '2026-11-17', endDate: '' })
 *     === { key: 'recurring.summary.weekly_noEnd', count: 12, day: 17, start: 'Nov 17 2026', end: '' }
 *   an empty or invalid count reads as 1: intervalCount '', 'abc', '4.5', '0' and '366'
 *     each give count 1; '007' gives 7
 *   eu number style: the monthly input above gives start '29.11.2026' and end '31.03.2027'
 */
export function recurrenceSummary(input: {
  intervalKind: RecurringTransaction['interval_kind']
  intervalCount: string
  startDate: string
  endDate: string
}): RecurrenceSummary {
  const n = Number(input.intervalCount)
  const count = Number.isInteger(n) && n >= 1 && n <= 365 ? n : 1
  return {
    key: SUMMARY_KEYS[input.intervalKind][input.endDate ? 'withEnd' : 'noEnd'],
    count,
    day: dayOfMonth(input.startDate),
    start: words(input.startDate),
    end: words(input.endDate),
  }
}
