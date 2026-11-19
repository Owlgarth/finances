import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { useAccounts } from './useDomain'
import { isCalendarMonth } from '../utils/dates'
import { formatMonthYear } from '../utils/format'
import { intListParam } from '../utils/params'

/** Shared scope chrome for the three Activity pages: the "Activity" title
 *  and a breadcrumb naming the current filtered scope - the month label
 *  when the URL range is an exact calendar month, plus the account name
 *  when exactly one account is filtered (the list pages' comma param and
 *  Transfers' single-id param both read as a one-entry list here).
 *  Derived from the URL at render time like the pages' export handlers:
 *  the label appears once defaults materialize into the URL, fine for a
 *  non-focus element. The accounts query shares the content components'
 *  cache entry - no extra fetch. */
export function useActivityScope(): { activityTitle: string; breadcrumb: string | undefined } {
  const { t } = useTranslation('nav')
  const [searchParams] = useSearchParams()
  const { data: accounts = [] } = useAccounts(false)

  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')
  const urlMonth = isCalendarMonth(rawFrom ?? '', rawTo ?? '')
  // The null check narrows the label's own type (a correlated const keeps
  // its nullable type at the use site); it is non-null exactly when
  // urlMonth is.
  const monthLabel = urlMonth && rawFrom !== null ? formatMonthYear(rawFrom) : null
  const accountIds = intListParam(searchParams, 'account')
  const soleAccount = accountIds.length === 1 ? accounts.find((a) => a.id === accountIds[0]) ?? null : null
  const breadcrumb =
    [monthLabel, soleAccount?.name ?? null].filter((part): part is string => part !== null).join(' / ') || undefined

  return { activityTitle: t('activity'), breadcrumb }
}
