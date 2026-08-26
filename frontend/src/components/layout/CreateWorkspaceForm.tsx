import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AxiosError } from 'axios'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import CurrencySetField from '../currencies/CurrencySetField'
import { currenciesApi } from '../../api/client'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../utils/errors'

interface CreateWorkspaceFormProps {
  onCancel: () => void
  onCreated?: () => void
  compact?: boolean
}

export default function CreateWorkspaceForm({ onCancel, onCreated, compact = false }: CreateWorkspaceFormProps) {
  const { createWorkspace } = useWorkspace()
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
      setName('')
      setCurrencyCodes(['PLN'])
      onCreated?.()
      onCancel()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to create workspace'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }

  if (compact) {
    return (
      <div className="p-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Workspace name"
          maxLength={100}
          className="w-full px-2 py-1.5 text-sm border border-border rounded-none focus:outline-none"
          autoFocus
          onKeyDown={handleKeyDown}
        />
        <div className="mt-2">
          <CurrencySetField
            value={currencyCodes}
            onChange={setCurrencyCodes}
            primaryLabel="Main account"
            placeholder="Select currencies"
            currencies={catalogCurrencies}
            compact
          />
        </div>
        <p className="mt-1 text-[11px] text-text-muted">
          You can enable more currencies later in workspace settings.
        </p>
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleCreate}
            disabled={!name.trim() || currencyCodes.length === 0 || isSubmitting}
            className="flex-1 px-2 py-1 text-xs font-medium bg-primary text-white rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-2 py-1 text-xs font-medium border border-border rounded-sm hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Workspace name"
        className="block w-64 rounded-none border border-border px-3 py-2 text-sm"
        onKeyDown={handleKeyDown}
        autoFocus
      />
      <div className="w-64">
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
      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={isSubmitting || !name.trim() || currencyCodes.length === 0}
          className="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded-sm hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-3 py-1.5 bg-surface border border-border text-text text-xs font-medium rounded-sm hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
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
