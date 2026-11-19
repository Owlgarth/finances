import { useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CloudOff, Loader2, ScanLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { transactionsApi } from '../api/client'
import type { TransactionType } from '../types'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { usePermissions } from '../hooks/usePermissions'
import { useExtractionConfig } from '../hooks/useDomain'
import { useTransactionForm } from '../hooks/useTransactionForm'
import { intParam } from '../utils/params'
import FormPage from '../components/layout/FormPage'
import TransactionFormFields from '../components/transactions/TransactionFormFields'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

// File types the receipt parser accepts - keep in sync with the
// byte-identical copy in components/transactions/TransactionFormFields.tsx
// (two consumers; extract a shared constant at the third).
const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

// Which footer action is in flight (drives the clicked button's spinner;
// both buttons disable on it, closing the click-to-mutation-start gap).
type SaveAction = 'save' | 'another' | null

/** Create-only host for the transaction form: URL-seeded (?type=, ?account=,
 *  ?copy=) create mode inside a FormPage, with the sticky two-action footer
 *  and an unsaved-changes confirm on close. Edit stays in the modal. */
export default function NewTransactionPage() {
  const { t } = useTranslation('transactions')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { workspace, isLoading: workspaceLoading } = useWorkspace()
  const { canWrite } = usePermissions()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()

  // URL-state contract: the seeds are read ONCE at mount (lazy initializers);
  // nothing on this page ever writes the URL. Param-only navigation cannot
  // re-run initializers anyway, but the lazy form keeps that a property of
  // construction rather than of router internals.
  const [initialAccountId] = useState(() => intParam(searchParams, 'account'))
  const [initialType] = useState<TransactionType>(() =>
    // 'income' seeds income; every other value reads as expense. A 'transfer'
    // type needs the transfer flow's own fields, and nothing links here with
    // one until that flow exists.
    searchParams.get('type') === 'income' ? 'income' : 'expense',
  )
  const [copyId] = useState(() => intParam(searchParams, 'copy'))

  // Copy-mode source. Keyed INSIDE the ['transactions'] family prefix so the
  // family's existing invalidation calls (create/edit/delete in the form hook
  // and the list pages) refetch it, like TransfersPage's edit-prefill query.
  const copyQuery = useQuery({
    queryKey: ['transactions', 'detail', copyId],
    queryFn: () => transactionsApi.get(copyId!),
    enabled: copyId !== null,
  })
  // Terminal error counts as known: a failed copy fetch degrades to plain
  // create mode (silent, like an optional-enhancement query - the URL keeps
  // ?copy= and the user can retry by reloading).
  const copyKnown = copyId === null || copyQuery.isSuccess || copyQuery.isError

  const form = useTransactionForm({
    // The gate: machinery starts only once the copy seed has resolved, so the
    // hook seeds exactly once with the final copyFrom (no create-then-copy
    // double seed, no category query firing against a form that is about to
    // be re-seeded). With no ?copy= the flag is true on first render, which
    // IS the "hook runs with open=true" contract.
    open: copyKnown,
    copyFrom: copyQuery.data ?? null,
    validationToasts: false, // the page shows field errors inline; save toasts stay
    initialAccountId,
    initialType,
  })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [savingAction, setSavingAction] = useState<SaveAction>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const amountInputRef = useRef<HTMLInputElement>(null)

  // Viewers (and, defense-in-depth, workspace-less mounts - MainLayout already
  // swaps children for its no-workspace message) never see this form. Held
  // through the workspace-loading window so a legitimate member is not bounced
  // by an unresolved role.
  if (!workspaceLoading && (!workspace || !canWrite)) {
    return <Navigate to="/" replace />
  }

  // Back navigation. React Router's history state carries the stack index
  // (idx); idx > 0 means an in-app entry exists to go back to. A direct load
  // or refresh of /new sits at idx 0 - falling back to the transactions list
  // keeps Back-like closes working from a deep link.
  const navigateBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/transactions', { replace: true })
  }

  const handleClose = () => {
    if (form.isDirty) setConfirmOpen(true)
    else navigateBack()
  }

  const handleSave = async () => {
    setSavingAction('save')
    const { ok } = await form.submit()
    setSavingAction(null)
    if (ok) navigateBack()
  }

  const handleSaveAndAddAnother = async () => {
    setSavingAction('another')
    const { ok } = await form.submit()
    setSavingAction(null)
    if (ok) {
      form.resetForAnother()
      // The fields stay mounted across saves, so the amount input's
      // mount-time autofocus never refires - refocus it by ref.
      amountInputRef.current?.focus()
    }
  }

  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) form.parseFile(f)
    // Same-file reselect must re-fire onChange; the File is already captured
    // by parseFile, so clearing the input value is safe.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const scanButton = extractionEnabled && (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={form.parse.isPending || !extractionReachable}
      title={extractionReachable ? undefined : t('form.scannerOfflineTitle')}
      className={`${secondaryButtonClass} disabled:hover:bg-surface inline-flex items-center gap-1`}
    >
      {form.parse.isPending ? (
        <>
          <Loader2 size={13} className="animate-spin" aria-hidden="true" /> {t('form.reading')}
        </>
      ) : extractionReachable ? (
        <>
          <ScanLine size={13} aria-hidden="true" /> {t('form.scanReceipt')}
        </>
      ) : (
        <>
          <CloudOff size={13} aria-hidden="true" /> {t('form.scanningOffline')}
        </>
      )}
    </button>
  )

  const savePending = savingAction !== null || form.isSaving

  // Copy-seed arrival gate: hold the form (fields AND footer) until ?copy=
  // resolves. The page keeps no saved-defaults machinery - this hold is the
  // only gate.
  if (!copyKnown) {
    return (
      <FormPage title={t('newTransaction')} onClose={handleClose}>
        <div className="space-y-3 pt-2" aria-hidden="true">
          <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
          <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
        </div>
      </FormPage>
    )
  }

  return (
    <>
      <FormPage
        title={t('newTransaction')}
        onClose={handleClose}
        headerAction={scanButton}
        footer={
          // Phone (<sm): stacked full-width buttons - two side-by-side labels
          // overflow at 375px in the longer locales. Primary last = nearest
          // the thumb, still inside the sticky, keyboard-aware footer.
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleSaveAndAddAnother}
              disabled={savePending}
              className={`${secondaryButtonClass} max-sm:w-full inline-flex items-center justify-center gap-1.5`}
            >
              {savingAction === 'another' ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  {t('form.saving')}
                </>
              ) : (
                t('form.saveAndAddAnother')
              )}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={savePending}
              className={`${primaryButtonClass} max-sm:w-full inline-flex items-center justify-center gap-1.5`}
            >
              {savingAction === 'save' ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  {t('form.saving')}
                </>
              ) : (
                t('form.saveTransaction')
              )}
            </button>
          </div>
        }
      >
        {/* Keyed on the hook's session key per the fields component's host
            contract: a session change remounts it (local-state reset + fresh
            autofocus). On this page the session is fixed per mount, so the
            fields stay mounted across "Save and add another". */}
        <TransactionFormFields key={form.sessionKey} form={form} amountInputRef={amountInputRef} />
      </FormPage>

      {/* Receipt picker for the header action - always mounted so .click()
          works inside the click gesture. The pending file itself is visible
          in the fields component's More-details receipt row. */}
      {/* No `capture` attribute: it makes mobile browsers open the camera
          directly instead of the source chooser - existing photos/files must
          stay pickable. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleReceiptFile}
        className="hidden"
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('unsavedChanges.title')}
        message={t('unsavedChanges.message')}
        confirmLabel={t('unsavedChanges.discard')}
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
