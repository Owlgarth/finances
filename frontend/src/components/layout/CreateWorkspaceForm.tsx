import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import CurrencySetField from '../currencies/CurrencySetField'
import Modal from '../common/Modal'
import { currenciesApi } from '../../api/client'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { getApiErrorMessage } from '../../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

interface CreateWorkspaceFormProps {
  onClose: () => void
}

/**
 * Create-workspace modal. Mount-per-use: the caller renders this component
 * ONLY while the flow is open - that conditional render is the open/close
 * mechanism, so the useState initializers re-run on every open and the
 * ['PLN'] preselection resets without a manual clear pass. All dismissals
 * (Close button, scrim, Escape) route through the Modal's overlay stack into
 * `onClose`; on success the backend switches the user into the new workspace,
 * so closing is the only cleanup the form owes.
 */
export default function CreateWorkspaceForm({ onClose }: CreateWorkspaceFormProps) {
  const { createWorkspace } = useWorkspace()
  // No autofocus on touch - don't yank the keyboard up over a fresh sheet.
  const isTouch = useIsTouch()
  const [name, setName] = useState('')
  // Ordered set of ISO codes sent as currency_codes; index 0 = the Main
  // account currency. Preselected with the light default (the backend's own
  // default primary); the user opts in to more.
  const [currencyCodes, setCurrencyCodes] = useState<string[]>(['PLN'])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Options for a workspace that does not exist yet: the workspace-scoped
  // enabled-currencies hook reads the CURRENT workspace's set, which is wrong
  // here, so read the global catalog instead and drop custom rows - custom
  // currencies belong to an existing workspace and a brand-new one cannot
  // select them. The query key is shared with the currencies settings
  // section (coordinated name).
  const { data: catalog = [] } = useQuery({
    queryKey: ['currency-catalog'],
    queryFn: currenciesApi.catalog,
    // The endpoint requires an active current workspace: creating the
    // FIRST workspace legitimately gets a 400. Fail fast there instead of
    // retrying - the ['PLN'] preselection still submits and more currencies
    // can be enabled later in workspace settings.
    retry: (failureCount, error) => {
      const status = (error as AxiosError)?.response?.status
      if (status === 400 || status === 403) return false
      return failureCount < 1
    },
  })
  const catalogCurrencies = catalog.filter((c) => !c.is_custom)

  const handleCreate = async () => {
    if (!name.trim()) return
    // Mirror of the name guard: Enter fires handleCreate even while the
    // submit button is disabled (see handleKeyDown), so the empty-set case
    // needs the same silent guard.
    if (currencyCodes.length === 0) return
    setIsSubmitting(true)
    try {
      await createWorkspace(name.trim(), currencyCodes)
      toast.success('Workspace created')
      onClose()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to create workspace'))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Enter submits from the name input. Escape is deliberately NOT handled
  // here: the surrounding Modal's overlay stack owns it, and a form-level
  // Escape branch would fight the stack's topmost-layer-only close.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
  }

  return (
    // `open` hardcoded: mount-per-use, the caller's render IS the open state
    // (see docblock). Default size 'md' - wide enough for the ordered
    // currency list; the height cap keeps long catalogs scrollable.
    <Modal open onClose={onClose} title="Create workspace" className="p-6 max-h-[85vh] overflow-y-auto">
      <div className="space-y-4">
        <div>
          <label htmlFor="create-workspace-name" className={labelClass}>Name</label>
          <input
            id="create-workspace-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
            maxLength={100}
            className={inputClass}
            autoFocus={!isTouch}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div>
          <CurrencySetField
            value={currencyCodes}
            onChange={setCurrencyCodes}
            primaryLabel="Main account"
            placeholder="Select currencies"
            currencies={catalogCurrencies}
          />
          <p className="mt-1 text-[11px] text-text-muted">
            You can enable more currencies later in workspace settings.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={secondaryButtonClass}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting || !name.trim() || currencyCodes.length === 0}
            className={primaryButtonClass}
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CreateWorkspaceButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-sm hover:bg-primary-hover transition-colors"
    >
      <Plus size={14} />
      Create Workspace
    </button>
  )
}

export { CreateWorkspaceButton }
