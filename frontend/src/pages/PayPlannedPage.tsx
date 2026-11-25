import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useWorkspace } from '../contexts/WorkspaceContext'
import { usePermissions } from '../hooks/usePermissions'
import { usePlannedTransaction } from '../hooks/useDomain'
import { usePayPlannedForm } from '../hooks/usePlannedPayment'
import FormPage from '../components/layout/FormPage'
import PageHeader from '../components/layout/PageHeader'
import PayPlannedForm from '../components/transactions/PayPlannedForm'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'
import type { PlannedTransaction } from '../types'

// The record pages' width and padding.
const PAGE_CLASS = 'p-6 max-sm:p-0 max-w-5xl mx-auto'

/** Where the pay page sends an item the form is not for: one paid here, one
 *  that can no longer be paid here, or a viewer's. One place decides it: the
 *  item's own record page. The search this page was opened with travels on
 *  in the URL and in router state, so the record's back arrow returns to
 *  the same filtered list. */
function itemHandoverTarget(plannedId: number, stateSearch: string): string {
  return `/planned/${plannedId}${stateSearch ? `?${stateSearch}` : ''}`
}

interface PayPlannedBodyProps {
  planned: PlannedTransaction
  /** The list's search this page was opened with; it travels with the hand-over. */
  stateSearch: string
  onLeave: () => void
}

/** The form for one loaded pending item. A child component rather than an
 *  inline branch of the page, so the form hook always mounts with its item:
 *  the page's early returns (not found, viewer, already paid) never skip a
 *  hook. */
function PayPlannedBody({ planned, stateSearch, onLeave }: PayPlannedBodyProps) {
  const { t } = useTranslation('planned')
  const navigate = useNavigate()
  const form = usePayPlannedForm(planned)

  const handleSubmit = async () => {
    if (!(await form.submit())) return
    // Replace: the finished form leaves Back's path. Where the item then
    // shows is decided in one place.
    navigate(itemHandoverTarget(planned.id, stateSearch), { replace: true, state: { search: stateSearch } })
  }

  return (
    <div className={PAGE_CLASS}>
      <FormPage
        title={t('pay.title')}
        onClose={onLeave}
        footer={
          // Phones: the back arrow is the leave path, so the primary alone,
          // full width. From sm up Cancel precedes it, right-aligned.
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onLeave} className={`${secondaryButtonClass} max-sm:hidden`}>
              {t('form.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={form.isSaving}
              className={`${primaryButtonClass} max-sm:w-full inline-flex items-center justify-center gap-1.5`}
            >
              {form.isSaving ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  {t('pay.submitting')}
                </>
              ) : (
                t('pay.submit')
              )}
            </button>
          </div>
        }
      >
        <PayPlannedForm form={form} planned={planned} />
      </FormPage>
    </div>
  )
}

/** Full-page host of "Paid differently": pays a pending planned item with
 *  another amount and date. Owns the item query and its states: not found
 *  for a foreign or garbage id, a hold skeleton while loading, and a
 *  hand-over for anything the form is not for (a viewer, a paid or skipped
 *  item). */
export default function PayPlannedPage() {
  const { t } = useTranslation('planned')
  const { id: idParam } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { canWrite } = usePermissions()
  const { isLoading: workspaceLoading } = useWorkspace()

  // The route param, the router state and the URL query are read per render.
  // The list's search rides in router state from the page that opened this
  // one; a URL that carries the list's filters in its own query instead
  // keeps them the same way.
  const plannedId = Number(idParam)
  const validId = Number.isInteger(plannedId) && plannedId > 0
  const stateSearch = typeof location.state?.search === 'string' ? location.state.search : location.search.slice(1)
  // The list itself with its search kept: the not-found state's way back,
  // and where a deep link lands when the form is left.
  const listPath = `/planned${stateSearch ? `?${stateSearch}` : ''}`
  // The hand-over keeps the list's search twice: in its URL, and in router
  // state, the form this page received it in.
  const carry = { search: stateSearch }

  // Leaving pops back to the list when an in-app entry sits behind this
  // page; a deep link or a reload sits at the bottom of the stack, where the
  // list replaces this form so it stays out of Back's path.
  const handleLeave = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(listPath, { replace: true })
  }

  const record = usePlannedTransaction(validId ? plannedId : null)

  if (!validId || record.isError) {
    // Not in this workspace (or not an id): say so and offer the list.
    return (
      <div className={PAGE_CLASS}>
        <PageHeader title={t('pay.title')} backTo={listPath} />
        <p className="text-sm text-text-muted mb-4">{t('pay.notFound')}</p>
        <Link to={listPath} className={secondaryButtonClass}>
          {t('pay.backToList')}
        </Link>
      </div>
    )
  }

  // Paying is a write: a viewer is handed on instead. Held through the
  // workspace-loading window so a member is not bounced by an unresolved
  // role.
  if (!workspaceLoading && !canWrite) {
    return <Navigate to={itemHandoverTarget(plannedId, stateSearch)} replace state={carry} />
  }

  // Only a pending item can be paid. A paid or skipped item is handed on
  // the same way.
  if (record.data && record.data.status !== 'pending') {
    return <Navigate to={itemHandoverTarget(plannedId, stateSearch)} replace state={carry} />
  }

  if (!record.data) {
    return (
      <div className={PAGE_CLASS}>
        <FormPage title={t('pay.title')} onClose={handleLeave}>
          {/* Hold, never flash: there is no correct empty form to show while
              the item loads. */}
          <div className="space-y-3 pt-2" aria-hidden="true">
            <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
            <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
          </div>
        </FormPage>
      </div>
    )
  }

  return <PayPlannedBody planned={record.data} stateSearch={stateSearch} onLeave={handleLeave} />
}
