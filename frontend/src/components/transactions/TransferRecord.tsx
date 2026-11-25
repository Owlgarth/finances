import { useQuery } from '@tanstack/react-query'
import { Repeat, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import AmountField from './AmountField'
import DateQuickPick from '../common/DateQuickPick'
import EditableField from '../common/EditableField'
import LinkedRow from '../common/LinkedRow'
import Select from '../common/Select'
import { FieldEditorShell, Section } from './recordParts'
import { reportsApi } from '../../api/client'
import { useAccounts } from '../../hooks/useDomain'
import { useTransferFieldSave } from '../../hooks/useTransferFieldSave'
import type { Transfer } from '../../types'
import { normalizeAmountInput } from '../../utils/amountInput'
import { formatAmount } from '../../utils/format'
import { destructiveButtonClass, inputClass, secondaryButtonClass } from '../common/formStyles'

/**
 * The transfer record: one content component rendered by two hosts - the
 * full-page route at every width for now (the side panel beside the list
 * replaces the 1024+ case later). The HOSTS own data loading (the
 * transfer query, loading and not-found states), confirm chrome (the
 * delete confirm dialog), and navigation; the record owns the field rows
 * and their one-field saves. Every save flows through
 * useTransferFieldSave - a full-replace PUT of the loaded row with one
 * field replaced, no optimistic update: the row shows its saving state
 * until the refetch lands.
 */
export interface TransferRecordProps {
  /** Fully loaded transfer (the host owns the query plus loading and
   *  error states). Saves flow through useTransferFieldSave. */
  transfer: Transfer
  /** Host-derived write permission (usePermissions().canWrite at the host).
   *  Passed as a prop - not re-derived here - because the hosts already
   *  compute it for their own chrome and the record stays host-neutral.
   *  False renders every row read-only and hides the footer actions. */
  canWrite: boolean
  /** Host-neutral repeat hook: the host owns navigation (the create flow
   *  with this row as the repeat source). */
  onRepeat: (transfer: Transfer) => void
  /** Host-neutral delete hook: the host owns the confirm dialog and the
   *  return-to-list navigation. */
  onDelete: (transfer: Transfer) => void
}

export default function TransferRecord({ transfer, canWrite, onRepeat, onDelete }: TransferRecordProps) {
  const { t } = useTranslation('transfers')
  const { save, isSaving } = useTransferFieldSave(transfer)
  const { data: accounts = [] } = useAccounts(false)

  const crossCurrency = transfer.from_currency_code !== transfer.to_currency_code
  // Read-only roles never edit, and a pending field save closes the
  // remaining rows too: each save is a full-replace PUT assembled from the
  // loaded row, so a second edit committed before the refetch lands would
  // revert the first. The gate only blocks opening an editor - one already
  // in progress keeps its draft and settles on its own (EditableField's
  // disabled reaches only the idle display button).
  const rowsDisabled = !canWrite || isSaving

  // Balances for the two account rows - the shared current-balances cache
  // family (the Sidebar/Dashboard key), found by account id.
  const { data: balances } = useQuery({
    queryKey: ['current-balances', false],
    queryFn: () => reportsApi.currentBalances(false),
  })
  const balanceOf = (accountId: number) =>
    balances?.accounts.find((row) => row.account_id === accountId) ?? null

  // Option lists mirror the transfer form's derivations. The stored side
  // is appended when missing from the ACTIVE list (archived since): the
  // backend sanctions editing such rows, and a picker that silently drops
  // the current value reads as a retarget.
  const activeAccountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))
  const optionsWithStored = (id: number, name: string, code: string) =>
    accounts.some((a) => a.id === id)
      ? activeAccountOptions
      : [{ value: id, label: `${name} (${code})` }, ...activeAccountOptions]
  const fromOptions = optionsWithStored(transfer.from_account_id, transfer.from_account_name, transfer.from_currency_code)
  const toOptions = optionsWithStored(transfer.to_account_id, transfer.to_account_name, transfer.to_currency_code)

  const fromAmountLabel = crossCurrency
    ? t('fields.amountSent', { code: transfer.from_currency_code })
    : t('fields.amount')

  // Amount row commit: reject unparseable or non-positive drafts so the
  // row restores and shows its error line without a doomed PUT (the wire
  // requires gt=0). The thrown message is display-swallowed by the landed
  // getApiErrorMessage fallback in EditableField (the TransactionRecord
  // amount editor has the same shape) - the check's value is the early
  // rejection.

  return (
    <div className="space-y-6">
      {/* 1. Summary: description, the From -> To line (the type-chip
           equivalent - a transfer has no type to chip), and the amounts in
           the list row's idiom (codes always shown: the two sides may hold
           different currencies, and the list row shows them
           unconditionally too). */}
      <div className="space-y-1">
        <p className="text-base font-medium text-text break-words">
          {transfer.description || <span className="text-text-muted">{t('record.noDescription')}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text">
            {transfer.from_account_name} → {transfer.to_account_name}
          </span>
        </div>
        <span className="font-mono text-base whitespace-nowrap block">
          <span className="whitespace-nowrap">{formatAmount(transfer.from_amount)} {transfer.from_currency_code}</span>
          {crossCurrency && (
            <span className="block text-[10px] text-text-muted whitespace-nowrap">
              → {formatAmount(transfer.to_amount)} {transfer.to_currency_code}
            </span>
          )}
        </span>
      </div>

      {/* 2. Details: Date, Description, Amount(s). */}
      <Section title={t('record.detailsTitle')}>
        <EditableField<string>
          label={t('fields.date')}
          value={transfer.date}
          display={<span className="font-mono text-xs">{transfer.date}</span>}
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag} escapeOnly>
              <DateQuickPick value={bag.value} onChange={bag.onChange} className="w-full" />
            </FieldEditorShell>
          )}
          onSave={(date) => save({ date })}
        />
        <EditableField<string>
          label={t('fields.description')}
          value={transfer.description}
          display={
            transfer.description ? (
              <span className="truncate">{transfer.description}</span>
            ) : (
              <span className="text-text-muted">{t('record.noDescription')}</span>
            )
          }
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <input
              value={bag.value}
              onChange={(e) => bag.onChange(e.target.value)}
              maxLength={500} /* mirrors the backend description max_length */
              {...bag.inputProps}
              className={inputClass}
            />
          )}
          onSave={(description) => save({ description: description.trim() })}
        />
        <EditableField<string>
          label={fromAmountLabel}
          value={transfer.from_amount}
          display={
            <span className="font-mono text-xs whitespace-nowrap">
              {formatAmount(transfer.from_amount)} {transfer.from_currency_code}
            </span>
          }
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag}>
              <AmountField id="record-from-amount" label={fromAmountLabel} value={bag.value} onChange={bag.onChange} />
            </FieldEditorShell>
          )}
          onSave={(raw) => {
            const norm = normalizeAmountInput(raw)
            if (norm === null || Number(norm) <= 0) throw new Error(t('validation.enterAmount'))
            return save({ from_amount: norm })
          }}
        />
        {crossCurrency && (
          <EditableField<string>
            label={t('fields.amountReceived', { code: transfer.to_currency_code })}
            value={transfer.to_amount}
            display={
              <span className="font-mono text-xs whitespace-nowrap">
                {formatAmount(transfer.to_amount)} {transfer.to_currency_code}
              </span>
            }
            disabled={rowsDisabled}
            renderEditor={(bag) => (
              <FieldEditorShell bag={bag}>
                <AmountField
                  id="record-to-amount"
                  label={t('fields.amountReceived', { code: transfer.to_currency_code })}
                  value={bag.value}
                  onChange={bag.onChange}
                />
              </FieldEditorShell>
            )}
            onSave={(raw) => {
              const norm = normalizeAmountInput(raw)
              if (norm === null || Number(norm) <= 0) throw new Error(t('validation.enterReceived'))
              return save({ to_amount: norm })
            }}
          />
        )}
      </Section>

      {/* 3. Accounts (the Belongs-to analog): From and To, each row both
           editable and a link to that account's page. */}
      <Section title={t('record.accountsTitle')}>
        <LinkedRow<number>
          to={`/accounts/${transfer.from_account_id}`}
          linkLabel={t('record.openAccountAria', { name: transfer.from_account_name })}
          label={t('fields.fromAccount')}
          value={transfer.from_account_id}
          display={
            <span className="truncate">
              {transfer.from_account_name}
              {balanceOf(transfer.from_account_id) && (
                <span className="font-mono text-text-muted">
                  {' · '}{formatAmount(balanceOf(transfer.from_account_id)!.balance)} {balanceOf(transfer.from_account_id)!.currency_code}
                </span>
              )}
            </span>
          }
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag} escapeOnly>
              <Select
                value={bag.value}
                onChange={bag.onChange}
                options={fromOptions}
                placeholder={t('fields.fromAccount')}
                aria-label={t('fields.fromAccount')}
                className="w-full"
              />
            </FieldEditorShell>
          )}
          // The save hook owns the pair -> to_amount coupling: switching a
          // side re-derives cross-currency from the effective pair's
          // currencies (active accounts, row fallback) and sends to_amount
          // by the form's rule.
          onSave={(from_account_id) => save({ from_account_id })}
        />
        <LinkedRow<number>
          to={`/accounts/${transfer.to_account_id}`}
          linkLabel={t('record.openAccountAria', { name: transfer.to_account_name })}
          label={t('fields.toAccount')}
          value={transfer.to_account_id}
          display={
            <span className="truncate">
              {transfer.to_account_name}
              {balanceOf(transfer.to_account_id) && (
                <span className="font-mono text-text-muted">
                  {' · '}{formatAmount(balanceOf(transfer.to_account_id)!.balance)} {balanceOf(transfer.to_account_id)!.currency_code}
                </span>
              )}
            </span>
          }
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag} escapeOnly>
              <Select
                value={bag.value}
                onChange={bag.onChange}
                options={toOptions}
                placeholder={t('fields.toAccount')}
                aria-label={t('fields.toAccount')}
                className="w-full"
              />
            </FieldEditorShell>
          )}
          onSave={(to_account_id) => save({ to_account_id })}
        />
      </Section>

      {/* 4. Footer - writers only. Repeat/Delete are host hooks; the host
           owns the navigation and the confirm chrome. */}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="mr-auto text-xs text-text-muted">{t('record.savesHint')}</span>
          <button type="button" onClick={() => onRepeat(transfer)} className={secondaryButtonClass}>
            <Repeat size={13} className="mr-1 inline" aria-hidden="true" /> {t('row.repeat')}
          </button>
          <button type="button" onClick={() => onDelete(transfer)} className={destructiveButtonClass}>
            <Trash2 size={13} className="mr-1 inline" aria-hidden="true" /> {t('row.delete')}
          </button>
        </div>
      )}
    </div>
  )
}
