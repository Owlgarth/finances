import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, X } from 'lucide-react'
import Select from '../common/Select'
import { currenciesApi } from '../../api/client'
import { useEnabledCurrencies } from '../../hooks/useDomain'
import { getApiErrorMessage } from '../../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

// Mirrors the backend enable-schema's code pattern.
const CUSTOM_CODE_PATTERN = /^[A-Z]{3,8}$/

/** Enabled-currency management for the workspace settings panel: the enabled
 *  list with per-row disable, a catalog enable picker, and an inline custom
 *  currency form. The panel mount-gates this on canManageCurrencies. */
export default function CurrenciesSettingsSection() {
  const queryClient = useQueryClient()
  const { data: enabled = [] } = useEnabledCurrencies()
  // Same key the workspace-creation form uses - one shared cache entry for
  // the authenticated catalog across all consumers.
  const { data: catalog = [] } = useQuery({
    queryKey: ['currency-catalog'],
    queryFn: () => currenciesApi.catalog(),
  })

  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customCode, setCustomCode] = useState('')
  const [customName, setCustomName] = useState('')
  const [customSymbol, setCustomSymbol] = useState('')
  const customFormId = useId()

  // Every mutation changes both the enabled set and the catalog view
  // (workspace customs appear/disappear), so all three invalidate both keys.
  const invalidateCurrencies = () => {
    queryClient.invalidateQueries({ queryKey: ['enabled-currencies'] })
    queryClient.invalidateQueries({ queryKey: ['currency-catalog'] })
  }

  const enableMutation = useMutation({
    mutationFn: (code: string) => currenciesApi.enable(code),
    onSuccess: (_result, code) => {
      invalidateCurrencies()
      toast.success(`${code} enabled`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to enable currency')),
  })

  // No confirm step: catalog currencies are re-enablable from the picker;
  // guarded failures (in-use / last currency) surface as error toasts.
  const disableMutation = useMutation({
    mutationFn: (code: string) => currenciesApi.disable(code),
    onSuccess: () => invalidateCurrencies(),
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to disable currency')),
  })

  const customMutation = useMutation({
    // No decimals field - storage and display are 2dp everywhere.
    mutationFn: () =>
      currenciesApi.createCustom({
        code: customCode.trim(),
        name: customName.trim(),
        symbol: customSymbol.trim(),
      }),
    onSuccess: () => {
      invalidateCurrencies()
      toast.success(`${customCode.trim()} added`)
      // Clear fields in onSuccess, never at submit time - a server rejection
      // must not wipe the typed values (the form stays open for correction).
      setShowCustomForm(false)
      setCustomCode('')
      setCustomName('')
      setCustomSymbol('')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to create custom currency')),
  })

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!CUSTOM_CODE_PATTERN.test(customCode.trim())) return toast.error('Code must be 3 to 8 uppercase letters')
    if (catalog.some((c) => c.code === customCode.trim())) return toast.error('Code already exists in the catalog')
    if (!customName.trim()) return toast.error('Name is required')
    if (!customSymbol.trim()) return toast.error('Symbol is required')
    customMutation.mutate()
  }

  const enabledCodes = new Set(enabled.map((c) => c.code))
  // Plain hyphen in the label, per the design pin (never an em dash).
  const enableOptions = catalog
    .filter((c) => !enabledCodes.has(c.code))
    .map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))

  return (
    <div className="border-t border-border pt-6">
      <h4 className="text-sm font-medium text-text mb-2">Currencies</h4>
      <div className="space-y-4">
        <ul className="border border-border rounded-sm divide-y divide-border">
          {enabled.map((c) => (
            <li key={c.code} className="flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm text-text">{c.code}</span>
                <span className="text-xs text-text-muted truncate">{c.name}</span>
                {c.is_custom && (
                  <span className="inline-flex px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text-muted select-none">
                    Custom
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => disableMutation.mutate(c.code)}
                disabled={disableMutation.isPending}
                aria-label={`Disable ${c.code}`}
                className="p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 rounded-sm text-text-muted hover:text-negative hover:bg-negative-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>

        {enableOptions.length > 0 && (
          <div>
            <label className={labelClass}>Add currency</label>
            <Select
              value={null}
              onChange={(code) => enableMutation.mutate(code)}
              options={enableOptions}
              placeholder="Select currency"
              aria-label="Add currency"
              mono
              searchable
              disabled={enableMutation.isPending}
            />
          </div>
        )}

        {!showCustomForm ? (
          <button
            type="button"
            onClick={() => setShowCustomForm(true)}
            aria-expanded={false}
            aria-controls={customFormId}
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors"
          >
            <Plus size={13} />
            Add custom currency
          </button>
        ) : (
          <form
            id={customFormId}
            role="region"
            aria-label="Add custom currency"
            onSubmit={handleCustomSubmit}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="custom-currency-code" className={labelClass}>Code</label>
                <input
                  id="custom-currency-code"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  className={inputClass}
                  placeholder="GTQ"
                  maxLength={8}
                />
              </div>
              <div>
                <label htmlFor="custom-currency-name" className={labelClass}>Name</label>
                <input
                  id="custom-currency-name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className={inputClass}
                  placeholder="Guatemalan quetzal"
                  maxLength={64}
                />
              </div>
              <div>
                <label htmlFor="custom-currency-symbol" className={labelClass}>Symbol</label>
                <input
                  id="custom-currency-symbol"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  className={inputClass}
                  placeholder="Q"
                  maxLength={8}
                />
              </div>
              {/* No decimals input - the invariant helper states why. */}
              <p className="self-end text-[11px] text-text-muted sm:col-span-2">
                Storage and display use 2 decimals for every currency.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={customMutation.isPending} className={primaryButtonClass}>
                {customMutation.isPending ? 'Adding…' : 'Add currency'}
              </button>
              <button type="button" onClick={() => setShowCustomForm(false)} className={secondaryButtonClass}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
