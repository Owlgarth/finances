import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Repeat, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { transfersApi } from '../api/client'
import { usePermissions } from '../hooks/usePermissions'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useTransferDeferredDelete } from '../hooks/useDeferredDelete'
import { useMainScrollRestoration } from '../hooks/useMainScrollRestoration'
import PageHeader from '../components/layout/PageHeader'
import TransferRecord from '../components/transactions/TransferRecord'
import { destructiveButtonClass, secondaryButtonClass } from '../components/common/formStyles'

/** Full-page host for a single transfer's record: the below-1024
 *  destination of a list row tap and (until the 1024+ side panel host
 *  lands) of every tier, so deep links work at any width. Owns the
 *  transfer query plus loading and not-found states, the header with
 *  back + Repeat/Delete actions (Delete arms the deferred-delete window
 *  and returns to the list at once - the Undo toast outlives the route
 *  change), and the not-found state for foreign, deleted or garbage
 *  ids - never an empty page with working fields. */
export default function TransferRecordPage() {
  const { t } = useTranslation('transfers')
  const { id: idParam } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { canWrite } = usePermissions()
  const { isTablet } = useBreakpoint()

  const transferId = Number(idParam)
  const validId = Number.isInteger(transferId) && transferId > 0
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
  const stateSearch = typeof location.state?.search === 'string' ? location.state.search : ''
  const backTo = `/transfers${stateSearch ? `?${stateSearch}` : ''}`
  const fromRowTap =
    typeof location.state?.search === 'string' && location.key !== 'default'
  const handleBack = fromRowTap ? () => navigate(-1) : undefined

  // 640-1023: MainLayout's <main> is the scroll container and a content
  // swap clamps it; the hook saves/restores its scrollTop per pathname.
  useMainScrollRestoration(isTablet)

  // Same cache entry as TransfersPage's edit prefill and /new's
  // copy_transfer query (['transfers', 'detail', id], inside the family
  // prefix), so the family-wide ['transfers'] invalidations (form save,
  // field save, delete, list pages) refetch it too. Mirrors useDomain's
  // useTransaction shape (id-null key + enabled gate; no retry override -
  // the family's detail queries keep the app defaults).
  const record = useQuery({
    queryKey: ['transfers', 'detail', validId ? transferId : null],
    queryFn: () => transfersApi.get(transferId),
    enabled: validId,
  })

  // Deferred delete: arm the window and return to the list at once -
  // this page disappearing IS the hide. The window and toast live at
  // module scope (hooks/useDeferredDelete.tsx), so the navigate-back does
  // not flush; on the list the row is hidden and Undo restores it.
  const { request: requestDelete } = useTransferDeferredDelete()
  const handleDelete = () => {
    if (!record.data) return
    requestDelete(record.data)
    // replace keeps the deleted record's URL out of Back's path (a POP
    // there would land on the not-found state).
    navigate(backTo, { replace: true })
  }

  // Repeat prefills the create page with this row as the copy_transfer
  // source (seed: pair + description, amounts/date cleared).
  const handleRepeat = () => navigate(`/new?type=transfer&copy_transfer=${transferId}`)

  if (!validId || record.isError) {
    // A record not in this workspace says so, with a link to its list -
    // no fields, nothing editable.
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
      <PageHeader
        title={t('record.title')}
        backTo={backTo}
        onBack={handleBack}
        actions={canWrite && record.data && (
          <>
            <button type="button" onClick={handleRepeat} className={secondaryButtonClass}>
              <Repeat size={13} className="inline mr-1" /> {t('row.repeat')}
            </button>
            <button type="button" onClick={handleDelete} className={destructiveButtonClass}>
              <Trash2 size={13} className="inline mr-1" /> {t('row.delete')}
            </button>
          </>
        )}
      />
      {record.isLoading ? (
        // Hold, never flash: the record page has no correct empty state to
        // show while the row loads, and fields would flash unstyled.
        <div className="space-y-3 pt-2" aria-hidden="true">
          <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
          <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
        </div>
      ) : record.data ? (
        <TransferRecord
          transfer={record.data}
          canWrite={canWrite}
          onRepeat={handleRepeat}
          onDelete={handleDelete}
        />
      ) : null}
    </div>
  )
}
