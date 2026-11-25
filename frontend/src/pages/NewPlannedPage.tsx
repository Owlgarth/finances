import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { usePermissions } from '../hooks/usePermissions'
import { usePlannedTransaction } from '../hooks/useDomain'
import { usePlannedForm } from '../hooks/usePlannedForm'
import { intParam } from '../utils/params'
import FormPage from '../components/layout/FormPage'
import PlannedFormFields from '../components/transactions/PlannedFormFields'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

/** Page host for creating a planned transaction: a plain create, or a copy
 *  (?copy=<id> on /planned/new) prefilled from an existing item with the
 *  date reset to today. Inside a FormPage with a sticky footer and an
 *  unsaved-changes confirm on close. Editing an item is not done here. */
export default function NewPlannedPage() {
  const { t } = useTranslation('planned')
  // The unsaved-changes strings live in the transactions namespace (every
  // form's shared home); aliased-t calls are hoisted per the lint rule.
  const { t: tTx } = useTranslation('transactions')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { workspace, isLoading: workspaceLoading } = useWorkspace()
  const { canWrite } = usePermissions()

  // URL-state contract: the seed is read ONCE at mount (lazy initializer);
  // nothing on this page ever writes the URL.
  const [copyId] = useState(() => intParam(searchParams, 'copy'))
  const copyQuery = usePlannedTransaction(copyId)
  // Terminal error counts as known: a failed or foreign copy fetch degrades
  // to plain create mode (silent - the URL keeps ?copy=).
  const copyKnown = copyId === null || copyQuery.isSuccess || copyQuery.isError
  const copySource = copyQuery.data ?? null

  // The gate: the form hook seeds exactly once, with the final copy source.
  // Without ?copy= the flag is true on the first render.
  const form = usePlannedForm({ open: copyKnown, copyFrom: copySource })

  const [confirmOpen, setConfirmOpen] = useState(false)

  // Viewers never see this form. Held through the workspace-loading window
  // so a legitimate member is not bounced by an unresolved role.
  if (!workspaceLoading && (!workspace || !canWrite)) {
    return <Navigate to="/planned" replace />
  }

  // Back navigation. React Router's history state carries the stack index
  // (idx); idx > 0 means an in-app entry exists to go back to. A direct load
  // or refresh of /planned/new sits at idx 0 - falling back to the planned
  // list keeps Back-like closes working from a deep link.
  const navigateBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/planned', { replace: true })
  }

  const handleClose = () => {
    if (form.isDirty) setConfirmOpen(true)
    else navigateBack()
  }

  // The hook toasts the outcome (a validation failure shows the field
  // errors instead); the host only leaves on success.
  const handleAdd = async () => {
    const { ok } = await form.submit()
    if (ok) navigateBack()
  }

  // Hoisted: an aliased-t call must not render inline.
  const unsavedTitle = tTx('unsavedChanges.title')
  const unsavedMessage = tTx('unsavedChanges.message')
  const unsavedDiscard = tTx('unsavedChanges.discard')
  const newTitle = t('form.newTitle')
  const cancelLabel = t('form.cancel')
  const addLabel = form.isSaving ? t('form.saving') : t('form.add')
  const cancelButton = `${secondaryButtonClass} max-sm:hidden`
  const addButton = `${primaryButtonClass} max-sm:w-full`

  // Copy-seed arrival gate: hold the form (fields AND footer) until ?copy=
  // resolves, so the fields never flash create defaults before the prefill.
  if (!copyKnown) {
    return (
      <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
        <FormPage title={newTitle} onClose={handleClose}>
          <div className="space-y-3 pt-2" aria-hidden="true">
            <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
            <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
          </div>
        </FormPage>
      </div>
    )
  }

  return (
    <>
      <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
        <FormPage
          title={newTitle}
          onClose={handleClose}
          footer={
            // Phones: the primary alone, full width - the back arrow is the
            // leave path. From 640 px: Cancel, then the primary.
            <div className="flex justify-end gap-2">
              <button type="button" onClick={handleClose} disabled={form.isSaving} className={cancelButton}>
                {cancelLabel}
              </button>
              <button type="button" onClick={handleAdd} disabled={form.isSaving} className={addButton}>
                {addLabel}
              </button>
            </div>
          }
        >
          <PlannedFormFields key={form.sessionKey} form={form} />
        </FormPage>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={unsavedTitle}
        message={unsavedMessage}
        confirmLabel={unsavedDiscard}
        destructive
        onConfirm={() => {
          setConfirmOpen(false)
          navigateBack()
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
