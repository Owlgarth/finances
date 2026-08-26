import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronDown, X } from 'lucide-react'
import Select from '../common/Select'
import { inputClass, labelClass, primaryButtonClass } from '../common/formStyles'
import { currenciesApi } from '../../api/client'
import { useEnabledCurrencies } from '../../hooks/useDomain'
import { usePermissions } from '../../hooks/usePermissions'
import { getApiErrorMessage } from '../../utils/errors'

// Authed catalog = global rows + this workspace's custom currencies. The key
// is module-local until a second consumer appears: creating or disabling a
// custom currency changes this list, so mutations below refresh it too.
const currencyCatalogKey = ['currency-catalog'] as const

// Mirrors backend EnableCurrencyIn (currencies/schemas.py): keep in sync.
const CURRENCY_CODE_PATTERN = /^[A-Z]{3,8}$/

export default function CurrenciesSettingsSection() {
  // Permission consumed here, never threaded down as a boolean prop - the
  // enabled list renders for every role; only the controls are gated.
  const { canManageCurrencies } = usePermissions()
  const queryClient = useQueryClient()
  const { data: enabled, isLoading, isError } = useEnabledCurrencies()
  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: currencyCatalogKey,
    queryFn: currenciesApi.catalog,
    // Viewers/members never see the picker, so they never need the catalog.
    enabled: canManageCurrencies,
  })

  const [customOpen, setCustomOpen] = useState(false)
  const customPanelId = useId()
  const [customCode, setCustomCode] = useState('')
  const [customName, setCustomName] = useState('')
  const [customSymbol, setCustomSymbol] = useState('')
  const [customDecimals, setCustomDecimals] = useState('2')

  // Both lists change on every write: enable/disable toggles membership,
  // create/delete of customs edits the authed catalog itself.
  const invalidateCurrencyQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['enabled-currencies'] })
    queryClient.invalidateQueries({ queryKey: currencyCatalogKey })
  }

  const enableMutation = useMutation({
    mutationFn: currenciesApi.enable,
    onSuccess: (currency) => {
      invalidateCurrencyQueries()
      toast.success(`${currency.code} enabled`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to enable currency')),
  })

  const disableMutation = useMutation({
    // No confirm dialog: disabling is reversible (re-enable from the picker)
    // and the server blocks the dangerous cases (last currency, in use) -
    // those 400 details surface through the error toast below.
    mutationFn: currenciesApi.disable,
    onSuccess: (_, code) => {
      invalidateCurrencyQueries()
      toast.success(`${code} disabled`)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to disable currency')),
  })

  const createCustomMutation = useMutation({
    mutationFn: currenciesApi.createCustom,
    onSuccess: (currency) => {
      invalidateCurrencyQueries()
      toast.success(`${currency.code} added`)
      // Clear in onSuccess only - clearing at submit time would wipe the
      // typed values on a server rejection and force a full retype.
      setCustomCode('')
      setCustomName('')
      setCustomSymbol('')
      setCustomDecimals('2')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to create currency')),
  })

  // The picker is an action trigger, not a persistent selection: the chosen
  // currency leaves the option list once enabled, so the trigger always
  // shows the placeholder and onChange fires the mutation.
  const catalogOptions = (catalog ?? [])
    .filter((c) => !c.is_custom && !(enabled ?? []).some((e) => e.code === c.code))
    .map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))

  const handleSubmitCustom = (e: React.FormEvent) => {
    e.preventDefault()
    // Mirrors EnableCurrencyIn - reject before the POST so the user gets a
    // field-level message instead of a raw 422.
    if (!CURRENCY_CODE_PATTERN.test(customCode)) return toast.error('Code must be 3 to 8 uppercase letters')
    if (!customName.trim()) return toast.error('Name is required')
    if (!customSymbol.trim()) return toast.error('Symbol is required')
    const decimals = Number(customDecimals)
    if (customDecimals === '' || !Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
      return toast.error('Decimals must be a whole number from 0 to 4')
    }
    createCustomMutation.mutate({ code: customCode, name: customName.trim(), symbol: customSymbol.trim(), decimals })
  }

  return (
    <div className="border-t border-border pt-6">
      <h4 className="text-sm font-medium text-text mb-2">Currencies</h4>

      {canManageCurrencies && (
        <div className="mb-4">
          <label className={labelClass}>Add from catalog</label>
          {/* Placed above the list on purpose: the dropdown panel is capped
              and can clip against a scrolling modal's lower edge, and the top
              of the section is where it has the most room. */}
          <Select
            value={null}
            onChange={(code) => enableMutation.mutate(code)}
            options={catalogOptions}
            placeholder="Select currency"
            aria-label="Enable a currency"
            mono
            searchable
            disabled={catalogLoading || enableMutation.isPending}
          />
        </div>
      )}

      {isLoading ? (
        // Wireframe skeleton rows, not a spinner.
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-4 py-2.5">
              <div className="h-4 w-28 bg-surface-muted rounded-sm animate-pulse" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-text-muted">Could not load currencies.</p>
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {(enabled ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex items-baseline gap-2">
                <span className="font-mono text-text flex-shrink-0">{c.code}</span>
                <span className="text-text-muted truncate">{c.name}</span>
                {c.is_custom && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-medium bg-surface-muted text-text-muted flex-shrink-0">
                    custom
                  </span>
                )}
              </div>
              {canManageCurrencies && (
                <button
                  type="button"
                  onClick={() => disableMutation.mutate(c.code)}
                  disabled={disableMutation.isPending && disableMutation.variables === c.code}
                  aria-label={`Disable ${c.code}`}
                  title="Disable"
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-sm text-text-muted hover:text-negative hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors touch-hit"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!canManageCurrencies && (
        <p className="mt-2 text-xs text-text-muted">Only workspace owners and admins can manage currencies.</p>
      )}

      {canManageCurrencies && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setCustomOpen((o) => !o)}
            aria-expanded={customOpen}
            aria-controls={customPanelId}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover max-sm:min-h-[44px]"
          >
            <ChevronDown size={12} className={'transition-transform ' + (customOpen ? 'rotate-180' : '')} />
            Add a custom currency
          </button>
          {customOpen && (
            <div id={customPanelId} role="region" aria-label="Add custom currency" className="mt-3">
              <form onSubmit={handleSubmitCustom} className="space-y-3">
                <div>
                  <label htmlFor="custom-currency-code" className={labelClass}>Code</label>
                  <input
                    id="custom-currency-code"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    placeholder="PTS"
                    maxLength={8}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="custom-currency-name" className={labelClass}>Name</label>
                  <input
                    id="custom-currency-name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Points"
                    maxLength={64}
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="custom-currency-symbol" className={labelClass}>Symbol</label>
                    <input
                      id="custom-currency-symbol"
                      value={customSymbol}
                      onChange={(e) => setCustomSymbol(e.target.value)}
                      placeholder="pts"
                      maxLength={8}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="custom-currency-decimals" className={labelClass}>Decimals</label>
                    <input
                      id="custom-currency-decimals"
                      type="number"
                      min={0}
                      max={4}
                      value={customDecimals}
                      onChange={(e) => setCustomDecimals(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <button type="submit" disabled={createCustomMutation.isPending} className={primaryButtonClass}>
                  {createCustomMutation.isPending ? 'Adding…' : 'Add currency'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
