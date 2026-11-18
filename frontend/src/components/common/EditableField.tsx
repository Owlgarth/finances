import { useState } from 'react'
import type { FocusEvent, KeyboardEvent, ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { getApiErrorMessage } from '../../utils/errors'
import BottomSheet from './BottomSheet'
import { controlHeightClass, labelClass, primaryButtonClass, secondaryButtonClass } from './formStyles'

/** Everything a field editor needs. `inputProps` is spread on the INDIVIDUAL
 * text-like input (input/textarea), never on a wrapper element - a wrapper
 * onKeyDown would hijack Enter from focused buttons inside it. Single-line
 * editors get Enter=commit, Escape=cancel, blur=commit. Multiline editors
 * override onKeyDown to keep Escape-cancel only: Enter must insert a newline,
 * and commit happens on blur or the sheet's Save button. */
export interface EditorBag<T> {
  value: T
  onChange: (next: T) => void
  commit: () => void
  cancel: () => void
  inputProps: {
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
    onBlur: (e: FocusEvent<HTMLElement>) => void
  }
}

export interface EditableFieldProps<T> {
  /** Committed value. Seeds the draft every time editing starts. */
  value: T
  /** Row label, already translated by the caller. */
  label: string
  /** Read-only rendering of the committed value (what the row shows when idle). */
  display: ReactNode
  /** Renders the editing UI for this one field. */
  renderEditor: (bag: EditorBag<T>) => ReactNode
  /** Persists the draft. The row stays in its saving state until this resolves;
   *  whether that includes the refetch is the caller's choice. Rejecting shows
   *  the server message under the row and restores the previous value. */
  onSave: (value: T) => Promise<unknown>
  /** Read-only row: the display renders but cannot be edited. */
  disabled?: boolean
}

export default function EditableField<T>({
  value,
  label,
  display,
  renderEditor,
  onSave,
  disabled = false,
}: EditableFieldProps<T>) {
  const { isMobile } = useBreakpoint()
  const { t } = useTranslation('common')

  // All editing state sits above the mobile/fine-pointer variant branches:
  // a resize across the 640px boundary mid-edit swaps presentation and the
  // typed draft must survive it.
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<T>(value)

  function startEdit() {
    setError(null)
    setDraft(value)
    setEditing(true)
  }

  function cancel() {
    if (saving) return // a save in flight must settle; the row/sheet shows it
    setEditing(false)
  }

  async function commit() {
    if (!editing || saving) return
    setSaving(true)
    try {
      await onSave(draft)
      setError(null)
      setEditing(false)
    } catch (err) {
      // Failed save: the editor unmounts (the display renders the caller's
      // committed data again, which restores the previous value) and the
      // server message shows under the row.
      setError(getApiErrorMessage(err, t('editableField.updateFailed')))
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const editor = renderEditor({
    value: draft,
    onChange: setDraft,
    commit,
    cancel,
    inputProps: {
      onKeyDown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          cancel()
        }
      },
      onBlur: (e) => {
        // Inside the sheet, commit is the Save button's job: moving focus
        // between the field and the sheet's buttons must not fire a save.
        if (isMobile) return
        // A blur fired while the editor is being detached from the document
        // (a cancel or a settled save just unmounted it) ends the session -
        // it must not re-commit. A real blur on a live editor commits.
        if (!e.currentTarget.isConnected) return
        commit()
      },
    },
  })

  const savingLabel = (
    <span className="flex items-center gap-1.5 text-xs text-text-muted">
      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
      {t('editableField.saving')}
    </span>
  )

  return (
    <div>
      <div className={`flex items-center justify-between gap-3 py-1.5 ${controlHeightClass}`}>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-text-muted">
          {label}
        </span>
        {editing ? (
          <div className="flex min-w-0 flex-1 justify-end">
            {saving ? savingLabel : editor}
          </div>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            disabled={disabled}
            className="min-w-0 flex-1 truncate text-right focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus disabled:cursor-default"
          >
            {display}
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-1 flex items-center gap-1 text-[11px] text-negative font-medium">
          <AlertCircle size={12} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Phone panel: one-field sheet. Rendered whenever mobile (not gated on
          `editing`) so BottomSheet can play its exit animation after a save or
          cancel - same contract as Select's mobile panel. */}
      {isMobile && (
        <BottomSheet open={editing} onClose={cancel} aria-label={label}>
          <div className="px-4 pb-4">
            <label className={labelClass}>{label}</label>
            {saving ? savingLabel : editor}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                className={secondaryButtonClass}
              >
                {t('editableField.cancel')}
              </button>
              <button
                type="button"
                onClick={commit}
                disabled={saving}
                className={`flex items-center gap-1.5 ${primaryButtonClass}`}
              >
                {saving && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                {saving ? t('editableField.saving') : t('editableField.save')}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
