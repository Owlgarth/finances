import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Upload } from 'lucide-react'
import Modal from '../common/Modal'
import { authApi, workspacesApi } from '../../api/client'
import type { LegacyImportResult } from '../../types'
import { getApiErrorMessage } from '../../utils/errors'
import { primaryButtonClass, secondaryButtonClass, modalTitleClass } from '../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
}

type Phase = 'select' | 'importing' | 'report'

export default function LegacyImportModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('select')
  const [result, setResult] = useState<LegacyImportResult | null>(null)
  // workspace_id -> chosen default budget id
  const [selections, setSelections] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setPhase('select')
    setResult(null)
    setSelections({})
    setSaving(false)
  }

  const handleClose = () => {
    if (phase === 'importing' || saving) return
    reset()
    onClose()
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return

    setPhase('importing')
    try {
      const text = await file.text()
      const exportData = JSON.parse(text)
      const imported = await authApi.importLegacy(exportData)
      // The import switches the current workspace server-side — refresh everything.
      queryClient.invalidateQueries()
      setResult(imported)
      // Preselect when a workspace got exactly one budget.
      const preselected: Record<number, number> = {}
      for (const ws of imported.workspaces) {
        if (ws.budgets.length === 1) preselected[ws.workspace_id] = ws.budgets[0].id
      }
      setSelections(preselected)
      setPhase('report')
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        toast.error('Invalid JSON file. Please select a valid export file.')
      } else {
        toast.error(getApiErrorMessage(error, 'Failed to import legacy data. Please try again.'))
      }
      setPhase('select')
    }
  }

  const workspacesNeedingChoice = result?.workspaces.filter((ws) => ws.budgets.length > 0) ?? []
  const allChosen = workspacesNeedingChoice.every((ws) => selections[ws.workspace_id] != null)

  const handleFinish = async () => {
    if (!result) return
    setSaving(true)
    try {
      await Promise.all(
        workspacesNeedingChoice.map((ws) => workspacesApi.setDefaultBudget(ws.workspace_id, selections[ws.workspace_id])),
      )
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      queryClient.invalidateQueries({ queryKey: ['workspace-current'] })
      toast.success(`Imported ${result.workspaces.length} workspace(s).`)
      reset()
      onClose()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save default budgets'))
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} size="lg" className="p-6 max-h-[90vh] overflow-y-auto">
      <h2 className={modalTitleClass}>Import from an older Denarly version</h2>

      {phase === 'select' && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Upload the JSON export from the old app. It will be converted to the new account-based
            model — exchanges become transfers, and a verification report shows each account's
            balance. Afterwards you'll pick a default budget for each imported workspace, so new
            transactions come pre-filled with a budget and its categories.
          </p>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFile} className="hidden" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={handleClose} className={secondaryButtonClass}>Cancel</button>
            <button type="button" onClick={() => fileRef.current?.click()} className={primaryButtonClass}>
              <Upload size={13} className="inline mr-1" /> Choose export file
            </button>
          </div>
        </div>
      )}

      {phase === 'importing' && (
        <div className="py-10 text-center text-sm text-text-muted">Importing your data…</div>
      )}

      {phase === 'report' && result && (
        <div className="space-y-4">
          {result.workspaces.map((ws) => (
            <div key={ws.workspace_id} className="p-4 bg-surface-hover rounded-sm border border-border text-sm space-y-3">
              <p className="font-medium text-text">{ws.workspace_name}</p>
              <p className="text-text-muted">
                Created: {Object.entries(ws.created).map(([k, v]) => `${v} ${k}`).join(', ')}
              </p>
              {ws.deduped_transactions.length > 0 && (
                <p className="text-text-muted">
                  Skipped {ws.deduped_transactions.length} linked exchange transaction(s) to avoid double-counting.
                </p>
              )}
              <div>
                <p className="text-text-muted mb-1">Balance verification:</p>
                <ul className="space-y-0.5">
                  {ws.balances.map((b) => (
                    <li key={b.account_name} className={`font-mono text-xs ${b.matches ? 'text-positive' : 'text-warning'}`}>
                      {b.account_name}: {b.computed_balance} {b.currency_code}
                      {!b.matches && b.expected_closing_balance !== null && (
                        <> (expected {b.expected_closing_balance} — reconcile)</>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              {ws.warnings.length > 0 && (
                <ul className="text-warning text-xs list-disc pl-4">
                  {ws.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {ws.budgets.length > 0 && (
                <div>
                  <p className="text-text mb-1.5 font-medium">Default budget</p>
                  <p className="text-xs text-text-muted mb-2">
                    Pre-selected in transaction forms so its categories are immediately available.
                  </p>
                  <div className="space-y-1">
                    {ws.budgets.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm text-text cursor-pointer">
                        <input
                          type="radio"
                          name={`default-budget-${ws.workspace_id}`}
                          checked={selections[ws.workspace_id] === b.id}
                          onChange={() => setSelections((prev) => ({ ...prev, [ws.workspace_id]: b.id }))}
                        />
                        {b.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {result.skipped_workspaces.length > 0 && (
            <p className="text-sm text-text-muted">
              Skipped (already exist): {result.skipped_workspaces.join(', ')}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            {!allChosen && <span className="text-xs text-text-muted mr-auto">Select a default budget for each workspace to finish.</span>}
            <button type="button" onClick={handleFinish} disabled={!allChosen || saving} className={primaryButtonClass}>
              {saving ? 'Saving…' : 'Finish'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
