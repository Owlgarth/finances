// Pace of a budget period: how much of the period has elapsed, and whether
// spending runs ahead of it. Pure date and exact-money math, no React.

import { toIsoDate } from './dates'
import { exceedsShare } from './format'

/** An ISO calendar date (yyyy-MM-dd) as a UTC-midnight day number, so a day
 *  difference is plain subtraction and a daylight-saving change inside the
 *  period cannot shift a day. */
function utcDay(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`) / 86400000
}

/**
 * Share of a period already elapsed on `today`, from 0 to 1: the days from
 * the start through today, both included, over the period's inclusive
 * length. The first day is 1 / N and the last day is 1, so the tick moves
 * on the first day and reaches the end on the last. null when the period
 * does not contain today: a past or future period has no tick.
 *
 * `today` is an ISO date (yyyy-MM-dd) and defaults to the LOCAL calendar
 * date. A caller that flags periods as past or future from another "today"
 * (the budget page uses the UTC date) passes that same value here, so its
 * tick and its flags can never disagree.
 *
 * Worked examples (docblock examples are the contract - the frontend
 * has no test runner, so they are the review reference; keep them in
 * sync if the behavior ever changes):
 *   const nov = { start_date: '2026-11-01', end_date: '2026-11-30' }
 *   elapsedShare(nov, '2026-11-16') === 16 / 30   // 0.5333: day 16 of 30
 *   elapsedShare(nov, '2026-11-01') === 1 / 30    // the first day
 *   elapsedShare(nov, '2026-11-30') === 1         // the last day
 *   elapsedShare(nov, '2026-10-31') === null      // today is before the period
 *   elapsedShare(nov, '2026-12-01') === null      // today is after the period
 *   elapsedShare({ start_date: '2028-02-01', end_date: '2028-03-01' }, '2028-02-29') === 29 / 30
 *   // the leap day counts
 */
export function elapsedShare(period: { start_date: string; end_date: string }, today?: string): number | null {
  const todayIso = today ?? toIsoDate(new Date())
  // Zero-padded ISO dates order correctly as plain strings.
  if (todayIso < period.start_date || todayIso > period.end_date) return null
  const start = utcDay(period.start_date)
  return (utcDay(todayIso) - start + 1) / (utcDay(period.end_date) - start + 1)
}

/** "More than five points past the tick" is the band: five percentage
 *  points are 500 basis points, a basis point being a 10,000th. */
const AHEAD_BAND_BPS = 500

/**
 * Does spending run ahead of the period's pace: is the spent share MORE
 * than five percentage points above the elapsed share? An exact money
 * claim (exceedsShare in utils/format.ts), never a float compare; the
 * elapsed share is rounded to whole basis points first. No tick (a null
 * elapsed share) and no plan (planned is 0) are never ahead.
 *
 * Worked examples (docblock examples are the contract - the frontend
 * has no test runner, so they are the review reference; keep them in
 * sync if the behavior ever changes):
 *   isAheadOfPace('60.00', '100.00', 16 / 30) === true    // 60% is 6.67 points past 53.33%
 *   isAheadOfPace('58.00', '100.00', 16 / 30) === false   // 4.67 points past: inside the band
 *   isAheadOfPace('59.00', '100.00', 0.54) === false      // exactly five points past is not more
 *   isAheadOfPace('60.00', '100.00', null) === false      // no tick: never ahead
 *   isAheadOfPace('50.00', '0.00', 0.5) === false         // no plan: no pace to run ahead of
 *   isAheadOfPace('110.00', '100.00', 1) === true         // the last day: over 105% is still ahead
 */
export function isAheadOfPace(spent: string, planned: string, elapsed: number | null): boolean {
  if (elapsed === null) return false
  const elapsedBps = Math.round(elapsed * 10000)
  return exceedsShare(spent, planned, elapsedBps + AHEAD_BAND_BPS)
}
