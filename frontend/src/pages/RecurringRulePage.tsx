import { useState } from 'react'
import { Link, Navigate, useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { plannedTransactionsApi } from '../api/client'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { usePermissions } from '../hooks/usePermissions'
import { useRecurringTransaction } from '../hooks/useDomain'
import { useRecurringForm } from '../hooks/useRecurringForm'
import { useRecurringRuleDelete } from '../hooks/useRecurringRuleDelete'
import { intParam } from '../utils/params'
import FormPage from '../components/layout/FormPage'
import RecurringFormFields from '../components/transactions/RecurringFormFields'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { destructiveButtonClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

/** Full-page host of the recurring rule form: create at /planned/rules/new
 *  (make-recurring when ?adopt=<plannedId> resolves to a planned row), edit
 *  at /planned/rules/:id. Owns the seeds (the rule, the row to adopt) and
 *  holds the form until they resolve, the title by mode, the sticky footer,
 *  the unsaved-changes confirm on close, in edit mode the Delete action
 *  with its "also delete pending rows" confirm, and the not-found state
 *  for a rule that is not in this workspace. */
export default function RecurringRulePage() {
  const { t } = useTranslation('planned')
  // The shared unsaved-changes strings live in the transactions namespace
  // (the /new page's own keys); all namespaces are eagerly loaded.
  const { t: tTx } = useTranslation('transactions')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { workspace, isLoading: workspaceLoading } = useWorkspace()
  const { canWrite } = usePermissions()

  // The mode comes from the matched route patterns rather than the route
  // params: the item routes also carry an :id. The create pattern is tested
  // first because the edit pattern matches the literal "new" segment as an
  // id.
  const isNew = useMatch('/planned/rules/new') !== null
  const ruleMatch = useMatch('/planned/rules/:id')
  const mode: 'create' | 'edit' = isNew || ruleMatch === null ? 'create' : 'edit'

  // URL-state contract: the seed is read ONCE at mount; nothing on this
  // page ever writes the URL.
  const [adoptId] = useState(() => intParam(searchParams, 'adopt'))

  const ruleId = mode === 'edit' && ruleMatch !== null ? Number(ruleMatch.params.id) : NaN
  const validRuleId = Number.isInteger(ruleId) && ruleId > 0 ? ruleId : null
  const rule = useRecurringTransaction(validRuleId)

  // Make-recurring seed, keyed inside the ['planned'] family so the family's
  // invalidations refetch it. Terminal error counts as known: a failed fetch
  // degrades to plain create (silent, like /new's ?copy= seed).
  const adoptQuery = useQuery({
    queryKey: ['planned', 'detail', adoptId],
    queryFn: () => plannedTransactionsApi.get(adoptId!),
    enabled: adoptId !== null,
  })
  const adoptSource = adoptQuery.data ?? null

  const formMode: 'create' | 'edit' | 'from-planned' =
    mode === 'edit' ? 'edit' : adoptSource ? 'from-planned' : 'create'
  const storedRule = mode === 'edit' ? rule.data ?? null : null
  // The form hook seeds only while open, so it stays closed until the seed
  // this mode needs has resolved.
  const seedKnown =
    mode === 'edit' ? rule.isSuccess : adoptId === null || adoptQuery.isSuccess || adoptQuery.isError

  // While the seed is unresolved the hook stays closed and sees the create
  // placeholders; the real mode and its seed arrive in the render that
  // opens it.
  const form = useRecurringForm(
    seedKnown
      ? { open: true, mode: formMode, rule: storedRule, fromPlanned: mode === 'create' ? adoptSource : null }
      : { open: false, mode: 'create' },
  )

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteRulePending, setDeleteRulePending] = useState(false)

  // The request, the refetches and the toasts are the shared hook's; the
  // per-call callbacks say where this page goes next.
  const deleteMutation = useRecurringRuleDelete()

  // Viewers (and, defense-in-depth, workspace-less mounts - MainLayout already
  // swaps children for its no-workspace message) never see this form. Held
  // through the workspace-loading window so a legitimate member is not bounced
  // by an unresolved role.
  if (!workspaceLoading && (!workspace || !canWrite)) {
    return <Navigate to="/planned?view=recurring" replace />
  }

  // Back navigation. React Router's history state carries the stack index
  // (idx); idx > 0 means an in-app entry exists to go back to. A direct load
  // or refresh sits at idx 0 - falling back to the recurring list keeps
  // Back-like closes working from a deep link.
  const navigateBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/planned?view=recurring', { replace: true })
  }

  // A rule this page cannot show says so instead of redirecting without a
  // word, once the workspace and the role are known (until then the hold
  // below shows, and a viewer is redirected above). A garbage id sends no
  // request; a deleted or foreign id ends in the detail read's error, after
  // its one retry. No fields, nothing editable, and the link goes to the
  // list the rule would belong to.
  if (!workspaceLoading && mode === 'edit' && (!validRuleId || rule.isError)) {
    return (
      <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
        <FormPage title={t('recurring.ruleTitle')} onClose={navigateBack}>
          <p className="text-sm text-text-muted mb-4">{t('recurring.notFound')}</p>
          <Link to="/planned?view=recurring" className={secondaryButtonClass}>
            {t('recurring.backToRules')}
          </Link>
        </FormPage>
      </div>
    )
  }

  const handleClose = () => {
    if (form.isDirty) setConfirmOpen(true)
    else navigateBack()
  }

  const handleSave = async () => {
    const { ok } = await form.submit()
    if (ok) navigateBack()
  }

  // Hold, never flash: the form has no correct empty state to show while its
  // seed loads, and the mode is not final until then.
  if (!seedKnown) {
    return (
      <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
        <FormPage title={t('recurring.ruleTitle')} onClose={navigateBack}>
          <div className="space-y-3 pt-2" aria-hidden="true">
            <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
            <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
          </div>
        </FormPage>
      </div>
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

  // Edit mode's Delete action: one handler and one class serve both copies.
  // From 640 px it sits in the title row. Below that the form page hides its
  // title-row slot (the prop on the element below), which gives the title
  // the whole row: the wider titles truncate beside a Delete button (the
  // Ukrainian edit title is the widest). So phones carry the action on their
  // own row under the title row, right-aligned. Each copy is hidden by one
  // breakpoint class, so exactly one is visible and focusable at any width,
  // and a crossing remounts nothing.
  const handleDelete = () => { setDeleteRulePending(false); setDeleteDialogOpen(true) }
  const deleteButtonClass = `${destructiveButtonClass} inline-flex items-center gap-1.5`

  return (
    <>
      <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
        <FormPage
          title={title}
          onClose={handleClose}
          hideHeaderActionOnPhone
          headerAction={storedRule && (
            <button
              type="button"
              onClick={handleDelete}
              className={deleteButtonClass}
            >
              <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
              {t('form.delete')}
            </button>
          )}
          footer={
            // Phones carry the primary alone (the back arrow is the leave
            // path, routed through the unsaved-changes confirm); from 640 px
            // Cancel precedes it, right-aligned.
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className={`${secondaryButtonClass} max-sm:hidden`}
              >
                {t('form.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={form.isSaving}
                className={`${primaryButtonClass} max-sm:w-full`}
              >
                {submitLabel}
              </button>
            </div>
          }
        >
          {storedRule && (
            <div className="flex justify-end mb-4 sm:hidden">
              <button
                type="button"
                onClick={handleDelete}
                className={deleteButtonClass}
              >
                <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
                {t('form.delete')}
              </button>
            </div>
          )}
          <RecurringFormFields form={form} />
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
      {storedRule && validRuleId !== null && (
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
            { id: validRuleId, deletePending: deleteRulePending },
            {
              // replace keeps the deleted rule's URL out of Back's path.
              onSuccess: () => navigate('/planned?view=recurring', { replace: true }),
              onError: () => setDeleteDialogOpen(false),
            },
          )}
          onCancel={() => setDeleteDialogOpen(false)}
        />
      )}
    </>
  )
}
