import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePlannedTransaction, useRecurringTransaction } from '../../hooks/useDomain'
import { useRecurringForm } from '../../hooks/useRecurringForm'
import { useRecurringRuleDelete } from '../../hooks/useRecurringRuleDelete'
import { intParam } from '../../utils/params'
import DetailPanel from '../layout/DetailPanel'
import RecurringFormFields from './RecurringFormFields'
import ConfirmDialog from '../common/ConfirmDialog'
import { destructiveButtonClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

export interface RecurringFormPanelProps {
  /** 'edit' on /planned/rules/:id (ruleId is then set), 'create' on
   *  /planned/rules/new, which is make-recurring while the URL carries
   *  ?adopt=<plannedId>. */
  mode: 'create' | 'edit'
  ruleId: number | null
  /** X, Escape and Cancel (after the unsaved-changes confirm), a saved rule
   *  and a deleted rule: the host replaces to the recurring list with the
   *  list's search kept. */
  onClose: () => void
  /** A saved make-recurring: the host replaces to the adopted item's record,
   *  which now links to its rule. Called in no other session. */
  onAdopted: (plannedId: number) => void
}

/** In-flow host of the recurring rule form in the Planned list's panel slot
 *  (the rule routes are the open state; the host owns every navigation and
 *  passes the two close writes). The rule page's logic in a panel: it owns
 *  the seeds (the rule, the row to adopt) and holds the form until they
 *  resolve, titles by mode, guards the close against unsaved changes and,
 *  in edit mode, offers Delete with its "also delete pending rows" confirm.
 *  Writers only: the host never mounts it for a viewer. */
export default function RecurringFormPanel({ mode, ruleId, onClose, onAdopted }: RecurringFormPanelProps) {
  const { t } = useTranslation('planned')
  // The shared unsaved-changes strings live in the transactions namespace
  // (the /new page's own keys); all namespaces are eagerly loaded.
  const { t: tTx } = useTranslation('transactions')
  const [searchParams] = useSearchParams()

  // URL-state contract: the seed is read ONCE at mount. The host keys the
  // panel per session, so every make-recurring mounts a fresh read.
  const [adoptId] = useState(() => (mode === 'create' ? intParam(searchParams, 'adopt') : null))

  const rule = useRecurringTransaction(mode === 'edit' ? ruleId : null)
  // A terminal error counts as known: a failed fetch degrades to plain
  // create (silent, like the new-planned page's ?copy= seed).
  const adoptQuery = usePlannedTransaction(adoptId)
  const adoptSource = mode === 'create' ? adoptQuery.data ?? null : null

  const formMode: 'create' | 'edit' | 'from-planned' =
    mode === 'edit' ? 'edit' : adoptSource ? 'from-planned' : 'create'
  const storedRule = mode === 'edit' ? rule.data ?? null : null
  // The form hook seeds only while open, so it stays closed until the seed
  // this session needs has resolved.
  const seedKnown =
    mode === 'edit' ? rule.isSuccess : adoptId === null || adoptQuery.isSuccess || adoptQuery.isError

  // While the seed is unresolved the hook stays closed and sees the create
  // placeholders; the real mode and its seed arrive in the render that
  // opens it.
  const form = useRecurringForm(
    seedKnown
      ? { open: true, mode: formMode, rule: storedRule, fromPlanned: adoptSource }
      : { open: false, mode: 'create' },
  )

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteRulePending, setDeleteRulePending] = useState(false)

  // The request, the refetches and the toasts are the shared hook's; the
  // per-call callbacks say what this host does next.
  const deleteMutation = useRecurringRuleDelete()

  const handleClose = () => {
    if (form.isDirty) setConfirmOpen(true)
    else onClose()
  }

  const handleSave = async () => {
    const { ok } = await form.submit()
    if (!ok) return
    // The adopted planned row now belongs to the rule: land on the row's
    // record, where its link to the rule shows. Any other save closes.
    if (form.mode === 'from-planned' && adoptId !== null) onAdopted(adoptId)
    else onClose()
  }

  // Hold, never flash: the form has no correct empty state to show while its
  // seed loads, and the mode is not final until then.
  if (!seedKnown) {
    return (
      <DetailPanel title={t('recurring.ruleTitle')} onClose={onClose}>
        <div className="space-y-3 pt-2" aria-hidden="true">
          <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
          <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
        </div>
      </DetailPanel>
    )
  }

  const title =
    formMode === 'edit'
      ? t('recurring.form.editTitle')
      : formMode === 'from-planned'
        ? t('recurring.form.fromPlannedTitle')
        : t('recurring.form.newTitle')
  const submitLabel = form.isSaving ? t('form.saving') : formMode === 'edit' ? t('form.save') : t('form.add')
  const deleteMessage = t('recurring.deleteDialog.message', { name: storedRule?.name ?? '' })
  const deletePendingLabel = t('recurring.deleteDialog.deletePending', { count: storedRule?.pending_planned_count ?? 0 })
  // Hoisted: the literal-string lint recognizes only the unaliased t() callee.
  const unsavedTitle = tTx('unsavedChanges.title')
  const unsavedMessage = tTx('unsavedChanges.message')
  const unsavedDiscard = tTx('unsavedChanges.discard')

  return (
    <>
      <DetailPanel title={title} onClose={handleClose}>
        <RecurringFormFields form={form} />
        {/* The actions close the body instead of riding the pinned footer:
            the panel is as tall as the list, so a footer row lands at the
            list's bottom, far below the fields on a long list. The negative
            margins undo the body's padding, so the row spans the panel from
            edge to edge; Delete (edit only) sits left, Cancel and the
            primary right. */}
        <div className="-mx-4 -mb-4 mt-4 flex flex-wrap justify-end gap-2 border-t border-border p-4">
          {storedRule && (
            <button
              type="button"
              onClick={() => { setDeleteRulePending(false); setDeleteDialogOpen(true) }}
              className={`${destructiveButtonClass} mr-auto inline-flex items-center gap-1.5`}
            >
              <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
              {t('form.delete')}
            </button>
          )}
          <button type="button" onClick={handleClose} className={secondaryButtonClass}>
            {t('form.cancel')}
          </button>
          <button type="button" onClick={handleSave} disabled={form.isSaving} className={primaryButtonClass}>
            {submitLabel}
          </button>
        </div>
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
      {storedRule && ruleId !== null && (
        <ConfirmDialog
          isOpen={deleteDialogOpen}
          title={t('recurring.deleteDialog.title')}
          message={deleteMessage}
          optionalSwitch={{
            label: deletePendingLabel,
            checked: deleteRulePending,
            onChange: setDeleteRulePending,
          }}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate(
            { id: ruleId, deletePending: deleteRulePending },
            {
              // The host replaces, keeping the deleted rule's URL out of Back's path.
              onSuccess: onClose,
              onError: () => setDeleteDialogOpen(false),
            },
          )}
          onCancel={() => setDeleteDialogOpen(false)}
        />
      )}
    </>
  )
}
