import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Copy, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { transactionsApi } from '../api/client'
import { useTransaction } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useMainScrollRestoration } from '../hooks/useMainScrollRestoration'
import { getApiErrorMessage } from '../utils/errors'
import PageHeader from '../components/layout/PageHeader'
import TransactionRecord from '../components/transactions/TransactionRecord'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { destructiveButtonClass, secondaryButtonClass } from '../components/common/formStyles'

/** Full-page host for a single transaction's record: the below-1024
 *  destination of a list row tap and (until the 1024+ side panel host
 *  lands) of every tier, so deep links work at any width. Owns the
 *  transaction query plus its loading and not-found states, the header
 *  with back + Duplicate/Delete actions, a delete ConfirmDialog that
 *  returns to the list on success, and the not-found state for foreign,
 *  deleted or garbage ids - never an empty page with working fields. */
export default function TransactionRecordPage() {
  const { t } = useTranslation('transactions')
  const { id: idParam } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const { isTablet } = useBreakpoint()

  // The route param and router state are read per render (a PUSH from the
  // list remounts this page on every entry anyway, so a read-once seed
  // would buy nothing).
  const txId = Number(idParam)
  const validId = Number.isInteger(txId) && txId > 0
  // Header back target: the list search the row tap carried in router
  // state (filters + page), or the bare list for deep links. A row tap
  // PUSHed here, so the arrow can POP back - the navigation the phone
  // scroll restoration now gates on - whenever both markers agree: the
  // router state only a row tap writes (a deep link's state is null, and
  // state does not survive a reload), and a non-initial history entry
  // (deep links sit at location.key 'default'; see NewTransactionPage's
  // idx twin). Deep links keep the PUSH backTo. Single navigation owner
  // either way: PageHeader calls onBack when provided, else its own
  // navigate(backTo).
  const stateSearch = typeof location.state?.search === 'string' ? location.state.search : ''
  const backTo = `/transactions${stateSearch ? `?${stateSearch}` : ''}`
  const fromRowTap =
    typeof location.state?.search === 'string' && location.key !== 'default'
  const handleBack = fromRowTap ? () => navigate(-1) : undefined

  // 640-1023: MainLayout's <main> is the scroll container and a content
  // swap clamps it; the hook saves/restores its scrollTop per pathname
  // (hooks/useMainScrollRestoration.ts).
  useMainScrollRestoration(isTablet)

  const record = useTransaction(validId ? txId : null)

  const [confirmOpen, setConfirmOpen] = useState(false)

  // Invalidates all three keys a transaction save touches
  // (['transactions'], ['current-balances'], ['account-balance']):
  // deleting changes the account balance exactly as editing does. The
  // list page's own row delete skips the third key; new code does the
  // right thing rather than copying that gap.
  const deleteMutation = useMutation({
    mutationFn: () => transactionsApi.delete(txId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      toast.success(t('deleted'))
      // Return to the list. replace keeps the deleted record's URL out of
      // Back's path (a POP there would land on the not-found state).
      navigate(backTo, { replace: true })
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('deleteFailed')))
      setConfirmOpen(false)
    },
  })

  // Duplicate prefills the create page with this row as the copy source
  // (the ?copy= seed NewTransactionPage reads). The 1024+ side panel host
  // later duplicates into its own copy mode instead of navigating.
  const handleDuplicate = () => navigate(`/new?copy=${txId}`)

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
            <button type="button" onClick={handleDuplicate} className={secondaryButtonClass}>
              <Copy size={13} className="inline mr-1" /> {t('rowActions.copy')}
            </button>
            <button type="button" onClick={() => setConfirmOpen(true)} className={destructiveButtonClass}>
              <Trash2 size={13} className="inline mr-1" /> {t('rowActions.delete')}
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
        <TransactionRecord
          transaction={record.data}
          canWrite={canWrite}
          onDuplicate={handleDuplicate}
          onDelete={() => setConfirmOpen(true)}
        />
      ) : null}
      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('deleteDialog.title')}
        message={t('deleteDialog.message', { description: record.data?.description })}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
