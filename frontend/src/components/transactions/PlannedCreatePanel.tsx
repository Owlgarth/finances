import { useState } from 'react'

import { useTranslation } from 'react-i18next'

import { usePlannedTransaction } from '../../hooks/useDomain'
import { usePlannedForm } from '../../hooks/usePlannedForm'
import DetailPanel from '../layout/DetailPanel'
import ConfirmDialog from '../common/ConfirmDialog'
import PlannedFormFields from './PlannedFormFields'
import { primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

interface PlannedCreatePanelProps {
  /** `copy` prefills from the item `copyId` names (a failed or foreign
   *  source degrades to a plain create); `create` ignores `copyId`. */
  mode: 'create' | 'copy'
  copyId: number | null
  /** The host's close write: it owns the URL that is this panel's open
   *  state, so the panel never navigates. */
  onClose: () => void
}

/** In-flow create/copy host for the side panel beside the planned list: the
 *  create page's form in a DetailPanel, with Cancel and Add at the end of
 *  the scrolling body and an unsaved-changes confirm on close. The host
 *  passes the mode and the copy source on every render, so a copy opened
 *  while the panel is already open re-targets it in place. */
export default function PlannedCreatePanel({ mode, copyId, onClose }: PlannedCreatePanelProps) {
  const { t } = useTranslation('planned')
  // The unsaved-changes strings live in the transactions namespace (every
  // form's shared home); aliased-t calls are hoisted per the lint rule.
  const { t: tTx } = useTranslation('transactions')

  // Copy-mode source fetch: one cache entry per id, shared with the record
  // panel and the create page. A terminal error counts as known - a failed
  // or foreign copy fetch degrades to plain create.
  const sourceId = mode === 'copy' ? copyId : null
  const copyQuery = usePlannedTransaction(sourceId)
  const copyKnown = sourceId === null || copyQuery.isSuccess || copyQuery.isError

  // The gate: the form hook seeds exactly once, with the final copy source.
  // Without a copy source the flag is true on the first render.
  const form = usePlannedForm({ open: copyKnown, copyFrom: copyQuery.data ?? null })

  const [confirmOpen, setConfirmOpen] = useState(false)
  // Escape, X and Cancel over typed text must not lose data the create page
  // protects - the same unsaved-changes guard.
  const dirtyClose = () => (form.isDirty ? setConfirmOpen(true) : onClose())

  // The hook toasts the outcome (a validation failure shows the field
  // errors instead); the panel only leaves on success.
  const handleAdd = async () => {
    const { ok } = await form.submit()
    if (ok) onClose()
  }

  // Hoisted: an aliased-t call must not render inline.
  const unsavedTitle = tTx('unsavedChanges.title')
  const unsavedMessage = tTx('unsavedChanges.message')
  const unsavedDiscard = tTx('unsavedChanges.discard')
  const newTitle = t('form.newTitle')
  const cancelLabel = t('form.cancel')
  const addLabel = form.isSaving ? t('form.saving') : t('form.add')

  return (
    <>
      <DetailPanel
        title={newTitle}
        // While the copy seed is still loading nothing of the user's is on
        // screen, so X and Escape close without asking.
        onClose={copyKnown ? dirtyClose : onClose}
      >
        {copyKnown ? (
          <>
            {/* Keyed on the hook's session key: a new session (a copy
                re-target) remounts the fields, resetting their local error
                latches and re-firing the name autofocus. */}
            <PlannedFormFields key={form.sessionKey} form={form} />
            {/* Action row at the end of the scrolling body, in the footer's
                own classes with negative margins: the panel stretches to
                the list's height, so a row pinned below the body would land
                at the list's bottom, below the fold on a long list. */}
            <div className="-mx-4 -mb-4 mt-4 border-t border-border p-4">
              <div className="flex justify-end gap-2">
                <button type="button" onClick={dirtyClose} disabled={form.isSaving} className={secondaryButtonClass}>
                  {cancelLabel}
                </button>
                <button type="button" onClick={handleAdd} disabled={form.isSaving} className={primaryButtonClass}>
                  {addLabel}
                </button>
              </div>
            </div>
          </>
        ) : (
          // Copy-seed arrival hold, the create page's skeleton idiom.
          <div className="space-y-3 pt-2" aria-hidden="true">
            <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
            <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
          </div>
        )}
      </DetailPanel>
      <ConfirmDialog
        isOpen={confirmOpen}
        title={unsavedTitle}
        message={unsavedMessage}
        confirmLabel={unsavedDiscard}
        destructive
        onConfirm={() => {
          setConfirmOpen(false)
          onClose()
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
