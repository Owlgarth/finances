import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../common/Modal'
import Select from '../common/Select'
import Switch from '../common/Switch'
import { accountsApi } from '../../api/client'
import type { Account, AccountType } from '../../types'
import { useEnabledCurrencies } from '../../hooks/useDomain'
import { useIsTouch } from '../../hooks/useBreakpoint'
import { getApiErrorMessage } from '../../utils/errors'
import { normalizeAmountInput } from '../../utils/amountInput'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  account?: Account | null
  /** Opens the workspace settings panel stacked above this form (create-mode
   *  currency bridge; AccountsPage gates it on canManageCurrencies). */
  onManageCurrencies?: () => void
}

// Keys only: t() is a hook result, so labels resolve inside the component.
const TYPE_OPTIONS: { value: AccountType; labelKey: 'typeOptions.bank' | 'typeOptions.cash' | 'typeOptions.other' }[] = [
  { value: 'bank', labelKey: 'typeOptions.bank' },
  { value: 'cash', labelKey: 'typeOptions.cash' },
  { value: 'other', labelKey: 'typeOptions.other' },
]

export default function AccountFormModal({ open, onClose, account, onManageCurrencies }: Props) {
  const { t } = useTranslation('accounts')
  const { t: tCommon } = useTranslation('common')
  const isEdit = !!account
  const queryClient = useQueryClient()
  // No autofocus on touch - don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const { data: currencies = [] } = useEnabledCurrencies()

  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [currencyCode, setCurrencyCode] = useState<string | null>(account?.currency_code ?? null)
  const [openingBalance, setOpeningBalance] = useState(account?.opening_balance ?? '0')
  const [isDefault, setIsDefault] = useState(account?.is_default_for_currency ?? false)

  // Session tracker for the render-adjust below: the open flip, or a
  // mid-open account swap, starts a new seeding session. The sentinel
  // initializer (closed, no source) can never match a real session, so the
  // first open always seeds. Needed because this modal is permanently
  // mounted (AccountsPage renders it unconditionally, no key): the useState
  // initializers above ran once at page load - with account undefined - so
  // without a re-seed on every open, Edit opens a blank form that saves
  // opening_balance: '0'.
  const [session, setSession] = useState<{
    open: boolean
    mode: 'edit' | 'create' | 'none'
    source: Account | null
  }>({ open: false, mode: 'none', source: null })

  // Re-seed every field from the prop at each session boundary. React
  // discards this render pass and re-runs the component with the seeded
  // state before anything commits.
  const mode = account ? 'edit' : 'create'
  const source = account ?? null
  const seeding = open !== session.open || session.mode !== mode || session.source !== source
  if (seeding) setSession({ open, mode, source })
  if (seeding && open) {
    setName(account?.name ?? '')
    setType(account?.type ?? 'bank')
    setCurrencyCode(account?.currency_code ?? null)
    setOpeningBalance(account?.opening_balance ?? '0')
    setIsDefault(account?.is_default_for_currency ?? false)
  }

  const mutation = useMutation({
    mutationFn: (normOpeningBalance: string) => {
      if (isEdit) {
        return accountsApi.update(account.id, { name: name.trim(), type, opening_balance: normOpeningBalance, is_default_for_currency: isDefault })
      }
      return accountsApi.create({
        name: name.trim(),
        type,
        currency_code: currencyCode!,
        opening_balance: normOpeningBalance,
        is_default_for_currency: isDefault,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      toast.success(isEdit ? t('toast.updated') : t('toast.created'))
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('toast.saveFailed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error(t('validation.nameRequired'))
    if (!isEdit && !currencyCode) return toast.error(t('validation.currencyRequired'))
    // The opening balance may be left empty (today's empty payload is kept
    // as-is); a typed value must parse in the active number style.
    const normOpeningBalance = openingBalance === '' ? '' : normalizeAmountInput(openingBalance)
    if (normOpeningBalance === null) return toast.error(tCommon('validation.amountInvalid'))
    mutation.mutate(normOpeningBalance)
  }

  const currencyOptions = currencies.map((c) => ({ value: c.code, label: t('currencyOption', { code: c.code, name: c.name }) }))

  return (
    <Modal open={open} onClose={onClose} className="p-6" title={isEdit ? t('modal.titleEdit') : t('modal.titleCreate')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="acc-name" className={labelClass}>{t('fields.name')}</label>
          <input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>

        <div>
          <label className={labelClass}>{t('fields.type')}</label>
          <Select
            value={type}
            onChange={(v) => setType(v)}
            options={TYPE_OPTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
            aria-label={t('fields.typeAria')}
            className="w-full"
          />
        </div>

        {!isEdit && (
          <div>
            <label className={labelClass}>{t('fields.currency')}</label>
            <Select
              value={currencyCode}
              onChange={(v) => setCurrencyCode(v)}
              options={currencyOptions}
              placeholder={t('fields.currencyPlaceholder')}
              aria-label={t('fields.currencyAria')}
              mono
              searchable
              className="w-full"
            />
            {/* Bridge link, aligned with CurrencySetField's exemplar:
                touch-hit is safe on this standalone link - the adjacent-
                button prohibition targets pairs whose hit areas overlap. */}
            {onManageCurrencies && (
              <button
                type="button"
                onClick={onManageCurrencies}
                className="mt-1 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus rounded-sm"
              >
                <Settings2 size={13} />
                {t('manageCurrencies')}
              </button>
            )}
          </div>
        )}

        <div>
          <label htmlFor="acc-opening" className={labelClass}>{t('fields.openingBalance')}</label>
          {/* text (not number): comma-decimal entry must reach the
              submit-time parser as typed (normalizeAmountInput). */}
          <input
            id="acc-opening"
            type="text" inputMode="decimal"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            className={inputClass}
          />
        </div>

        {(isEdit || !!currencyCode) && (
          <label className="inline-flex items-center gap-3 text-xs text-text cursor-pointer">
            <Switch
              checked={isDefault}
              onChange={setIsDefault}
              aria-label={t('fields.defaultFor', { code: isEdit ? account!.currency_code : currencyCode })}
            />
            {t('fields.defaultFor', { code: isEdit ? account!.currency_code : currencyCode })}
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('formActions.cancel')}</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? t('formActions.saving') : isEdit ? t('formActions.save') : t('formActions.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
