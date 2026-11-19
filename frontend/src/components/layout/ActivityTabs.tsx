import { NavLink, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { intListParam } from '../../utils/params'

const SEGMENT_CLASS =
  'flex flex-1 items-center justify-center py-1.5 max-sm:min-h-[44px] text-xs font-medium transition-colors ' +
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus '

const ACTIVITY_TABS = [
  { to: '/transactions', labelKey: 'transactions', singleAccountFilter: false },
  { to: '/planned', labelKey: 'planned', singleAccountFilter: false },
  { to: '/transfers', labelKey: 'transfers', singleAccountFilter: true },
] as const

type ActivityTab = (typeof ACTIVITY_TABS)[number]

/** Query string a tab switch carries: the date range always travels when
 *  present; the account filter travels as a comma list between the two
 *  list pages and as a single id to Transfers only when exactly one
 *  account is selected (the transfers filter holds one id). Every other
 *  param stays behind - a tab switch is a scope change, not a filter
 *  copy. */
function carrySearch(tab: ActivityTab, params: URLSearchParams): string {
  const next = new URLSearchParams()
  const dateFrom = params.get('from')
  const dateTo = params.get('to')
  if (dateFrom) next.set('from', dateFrom)
  if (dateTo) next.set('to', dateTo)
  // One read covers both source shapes: the list pages' comma list and
  // Transfers' single id both parse as a list, so only the emit differs.
  const accountIds = intListParam(params, 'account')
  if (accountIds.length > 0) {
    if (tab.singleAccountFilter) {
      if (accountIds.length === 1) next.set('account', String(accountIds[0]))
    } else {
      next.set('account', accountIds.join(','))
    }
  }
  const search = next.toString()
  return search ? `?${search}` : ''
}

/** The Activity tab row's three-segment control. The surrounding row
 *  (margin, trailing space for future header actions) belongs to the
 *  page - pages append their own members beside this control. The
 *  control itself carries no width class: it sizes to its segments and
 *  leaves measurable space at the row's end. */
export default function ActivityTabs() {
  const { t } = useTranslation('nav')
  const [searchParams] = useSearchParams()

  return (
    <div className="flex border border-border rounded-none overflow-hidden">
      {ACTIVITY_TABS.map((tab, i) => (
        <NavLink
          key={tab.to}
          to={tab.to + carrySearch(tab, searchParams)}
          className={({ isActive }) =>
            SEGMENT_CLASS +
            (isActive
              ? 'bg-primary text-white '
              : 'bg-surface text-text-muted hover:text-text hover:bg-surface-hover ') +
            (i > 0 ? 'border-l border-border ' : '')
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </div>
  )
}
