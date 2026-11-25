import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { usePlannedTransaction } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useMainScrollRestoration } from '../hooks/useMainScrollRestoration'
import PageHeader from '../components/layout/PageHeader'
import PlannedRecord from '../components/transactions/PlannedRecord'
import { secondaryButtonClass } from '../components/common/formStyles'

/** Full-page host for a single planned item's record: the below-1024
 *  destination of a list row tap and (until the 1024+ side panel host
 *  lands) of every tier, so deep links work at any width. Owns the item
 *  query plus its loading and not-found states, the header, and the
 *  navigation for every record action; the record owns its rows, its
 *  one-field saves and its pay, skip and delete mutations with their
 *  confirm dialogs. The not-found state covers foreign, deleted and
 *  garbage ids - never an empty page with working fields. */
export default function PlannedRecordPage() {
  const { t } = useTranslation('planned')
  const { id: idParam } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { canWrite } = usePermissions()
  const { isTablet } = useBreakpoint()

  // The route param and router state are read per render (a PUSH from the
  // list remounts this page on every entry anyway, so a read-once seed
  // would buy nothing).
  const plannedId = Number(idParam)
  const validId = Number.isInteger(plannedId) && plannedId > 0
  // Header back target: the list search the row tap carried in router
  // state (filters + page), or the bare list for deep links. A row tap
  // PUSHed here, so the arrow can POP back - the navigation the phone
  // scroll restoration now gates on - whenever both markers agree: the
  // router state only a row tap writes (a deep link's state is null, and
  // state does not survive a reload), and a non-initial history entry
  // (deep links sit at location.key 'default'). Deep links keep the PUSH
  // backTo. Single navigation owner either way: PageHeader calls onBack
  // when provided, else its own navigate(backTo). Mirrors
  // TransactionRecordPage's twin derivation.
  // A page opened by resizing an open side panel down to this tier has no
  // router state but carries the list's filters in its own URL: fall back to
  // those, so its back arrow still returns to the filtered list.
  const stateSearch = typeof location.state?.search === 'string' ? location.state.search : location.search.slice(1)
  const backTo = `/planned${stateSearch ? `?${stateSearch}` : ''}`
  const fromRowTap =
    typeof location.state?.search === 'string' && location.key !== 'default'
  const handleBack = fromRowTap ? () => navigate(-1) : undefined

  // 640-1023: MainLayout's <main> is the scroll container and a content
  // swap clamps it; the hook saves/restores its scrollTop per pathname.
  useMainScrollRestoration(isTablet)

  const record = usePlannedTransaction(validId ? plannedId : null)

  // Navigation for the record's action hooks. Delete replaces, so the
  // deleted item's URL stays out of Back's path (a POP there would land on
  // the not-found state).
  const handleDeleted = () => navigate(backTo, { replace: true })
  // The pushes forward the list search in router state, so the pay page's
  // return to this record and this record's Back target keep the filtered
  // list (a push without state would read as a deep link on the way back).
  const handlePayDifferently = () => navigate(`/planned/${plannedId}/pay`, { state: location.state })
  const handleMakeRecurring = () => navigate(`/planned/rules/new?adopt=${plannedId}`, { state: location.state })
  const handleCopy = () => navigate(`/planned/new?copy=${plannedId}`, { state: location.state })

  if (!validId || record.isError) {
    // An item not in this workspace says so, with a link to its list - no
    // fields, nothing editable.
    return (
      <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
        <PageHeader title={t('record.title')} backTo={backTo} onBack={handleBack} />
        <p className="text-sm text-text-muted mb-4">{t('record.notFound')}</p>
        <Link to={backTo} className={secondaryButtonClass}>
          {t('record.backToList')}
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <PageHeader title={t('record.title')} backTo={backTo} onBack={handleBack} />
      {record.isLoading ? (
        // Hold, never flash: the record page has no correct empty state to
        // show while the row loads, and fields would flash unstyled.
        <div className="space-y-3 pt-2" aria-hidden="true">
          <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
          <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
        </div>
      ) : record.data ? (
        <PlannedRecord
          planned={record.data}
          canWrite={canWrite}
          onDeleted={handleDeleted}
          onPayDifferently={handlePayDifferently}
          onMakeRecurring={handleMakeRecurring}
          onCopy={handleCopy}
        />
      ) : null}
    </div>
  )
}
