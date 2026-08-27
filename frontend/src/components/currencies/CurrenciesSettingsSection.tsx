import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import Select from '../common/Select'
import { currenciesApi } from '../../api/client'
import type { CatalogCurrency } from '../../types'
import { useEnabledCurrencies } from '../../hooks/useDomain'
import { getApiErrorMessage } from '../../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

// Mirrors the backend enable-schema's code pattern.
const CUSTOM_CODE_PATTERN = /^[A-Z]{3,8}$/

// Next arrangement after moving the code at `idx` by `dir` (-1 up / +1 down).
// Returns the SAME array reference when the move would leave the range (the
// arrow buttons are disabled there anyway, so the mutation is a cheap no-op).
// Inline twin of CurrencySetField's moveCode - two consumers do not justify a
// shared module; a third consumer would.
function moveCode(codes: string[], idx: number, dir: 1 | -1): string[] {
  const target = idx + dir
  if (target < 0 || target >= codes.length) return codes
  const next = [...codes]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  return next
}

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

  // The set-changing mutations (enable / disable / custom) change both the
  // enabled set and the catalog view (workspace customs appear/disappear),
  // so they invalidate both keys. Reorder is set-preserving and owns its
  // narrower invalidation internally.
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

  // Reorder swaps adjacent rows; the optimistic cache write in onMutate is
  // the whole feedback - no success toast (three rapid clicks must not
  // stack toasts; a deliberate exception to this section's toast habit).
  const reorderMutation = useMutation({
    mutationFn: (codes: string[]) => currenciesApi.reorder(codes),
    onMutate: (codes) => {
      // onMutate runs synchronously in the click tick, so the row swap
      // renders immediately. Codes derive from the rendered list, so every
      // lookup hits; the filter keeps the cached entry's type honest.
      const reordered = codes.map((code) => enabled.find((c) => c.code === code))
      queryClient.setQueryData<CatalogCurrency[]>(
        ['enabled-currencies'],
        reordered.filter((c): c is CatalogCurrency => c !== undefined),
      )
      return { previous: enabled }
    },
    onError: (error, _codes, context) => {
      // Snap the rows back to the pre-click arrangement, then say why.
      if (context?.previous) {
        queryClient.setQueryData<CatalogCurrency[]>(['enabled-currencies'], context.previous)
      }
      toast.error(getApiErrorMessage(error, 'Failed to reorder currencies'))
    },
    onSettled: () => {
      // A reorder changes neither the enabled set nor the catalog - only
      // the list refetches, reconciling the optimistic write with the
      // stored server order.
      queryClient.invalidateQueries({ queryKey: ['enabled-currencies'] })
    },
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

  const handleMove = (idx: number, dir: 1 | -1) => {
    reorderMutation.mutate(moveCode(enabled.map((c) => c.code), idx, dir))
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
          {enabled.map((c, idx) => (
            <li key={c.code} className="flex items-center justify-between px-3 py-2">
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-sm text-text">{c.code}</span>
                <span className="text-xs text-text-muted truncate">{c.name}</span>
                {idx === 0 && (
                  <span className="ml-2 text-[9px] font-mono uppercase tracking-widest text-text-muted">Primary</span>
                )}
                {c.is_custom && (
                  <span className="inline-flex px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text-muted select-none">
                    Custom
                  </span>
                )}
              </span>
              <span className="flex items-center gap-2">
                {/* Real padded hit areas, not the shared hit-area utility:
                    adjacent buttons' expanded areas would overlap. The 44px
                    floor fits inside the py-2 row via -my-2. All arrows also
                    disable while a reorder is in flight so rapid clicks
                    cannot interleave moves. */}
                <button
                  type="button"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0 || reorderMutation.isPending}
                  aria-label={`Move ${c.code} up`}
                  className="p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === enabled.length - 1 || reorderMutation.isPending}
                  aria-label={`Move ${c.code} down`}
                  className="p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 flex items-center justify-center rounded-sm text-text-muted hover:bg-surface-hover hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => disableMutation.mutate(c.code)}
                  disabled={disableMutation.isPending}
                  aria-label={`Disable ${c.code}`}
                  className="p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-2 rounded-sm text-text-muted hover:text-negative hover:bg-negative-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <X size={13} />
                </button>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-text-muted">The first currency is the workspace primary - it appears first in every currency dropdown.</p>

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
