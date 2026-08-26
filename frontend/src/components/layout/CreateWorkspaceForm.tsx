import { useState } from 'react'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { usePublicCurrencyCatalog, DEFAULT_CURRENCY_CODES } from '../../hooks/usePublicCurrencyCatalog'
import { getApiErrorMessage } from '../../utils/errors'
import Modal from '../common/Modal'
import MultiSelect from '../common/MultiSelect'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

interface CreateWorkspaceFormProps {
  open: boolean
  onClose: () => void
}

/**
 * Create-workspace modal (name + starting currencies). Used by the
 * WorkspaceSelector dropdown, the BottomNav More sheet, and the MainLayout
 * no-workspace page - never inline: a 155-row searchable picker needs a real
 * overlay, not a scroll-clipping dropdown panel.
 */
export default function CreateWorkspaceForm({ open, onClose }: CreateWorkspaceFormProps) {
  const { createWorkspace } = useWorkspace()
  const { options: currencyOptions, isLoading: currenciesLoading, isError: currenciesError } =
    usePublicCurrencyCatalog()
  const [name, setName] = useState('')
  const [currencyCodes, setCurrencyCodes] = useState<string[]>([...DEFAULT_CURRENCY_CODES])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Every dismissal path (Cancel/Close/scrim/Escape) funnels through onClose;
  // resetting here keeps a re-open clean without an open-effect.
  const handleClose = () => {
    setName('')
    setCurrencyCodes([...DEFAULT_CURRENCY_CODES])
    onClose()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    if (currencyCodes.length === 0) {
      toast.error('Select at least one currency')
      return
    }
    setIsSubmitting(true)
    try {
      await createWorkspace(trimmed, currencyCodes)
      toast.success('Workspace created')
      // Reset only on success - a server rejection must not wipe the typed values.
      setName('')
      setCurrencyCodes([...DEFAULT_CURRENCY_CODES])
      onClose()
    } catch (error) {
      // Stay open so the input can be corrected; the error is toasted here.
      toast.error(getApiErrorMessage(error, 'Failed to create workspace'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Create workspace" size="sm" className="p-6">
      <form className="space-y-4" onSubmit={handleCreate}>
        <div>
          <label htmlFor="new-workspace-name" className={labelClass}>
            Workspace name *
          </label>
          <input
            id="new-workspace-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Budget"
            maxLength={100}
            required
            autoFocus
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="new-workspace-currencies" className={labelClass}>
            Currencies *
          </label>
          {currenciesLoading ? (
            <div className="h-8 w-full bg-surface-muted animate-pulse" />
          ) : (
            <MultiSelect
              id="new-workspace-currencies"
              values={currencyCodes}
              onChange={setCurrencyCodes}
              options={currencyOptions}
              placeholder="Select currencies"
              searchable
              mono
            />
          )}
          {currencyCodes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {/* Selection-order chips; first = Main account currency.
                  Keep in sync with Register's copy (extract into a shared
                  component at a third consumer). */}
              {currencyCodes.map((code, i) => (
                <span
                  key={code}
                  className="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none"
                >
                  {code}
                  {i === 0 && <span className="ml-1.5 text-text-muted">Main</span>}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-text-muted leading-relaxed">
            {currenciesError
              ? "Couldn't load all currencies - your selection still works."
              : 'The first currency becomes your Main account. You can enable more later.'}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim() || currencyCodes.length === 0}
            className={primaryButtonClass}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CreateWorkspaceButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-sm hover:bg-primary-hover transition-colors"
    >
      <Plus size={14} />
      Create Workspace
    </button>
  )
}

export { CreateWorkspaceButton }
