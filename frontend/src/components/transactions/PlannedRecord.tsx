import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Ban, CheckCircle, ChevronRight, Copy, Repeat, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import AmountField from './AmountField'
import PlannedStatusChip from './PlannedStatusChip'
import { FieldEditorShell, Section } from './recordParts'
import ConfirmDialog from '../common/ConfirmDialog'
import DatePicker from '../DatePicker'
import EditableField from '../common/EditableField'
import type { EditorBag } from '../common/EditableField'
import LinkedRow from '../common/LinkedRow'
import Select from '../common/Select'
import { plannedTransactionsApi } from '../../api/client'
import { useMultiCurrency, useTransaction } from '../../hooks/useDomain'
import { usePlannedFieldOptions } from '../../hooks/usePlannedForm'
import { usePlannedFieldSave } from '../../hooks/usePlannedFieldSave'
import { usePlannedPayment } from '../../hooks/usePlannedPayment'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import type { PlannedTransaction } from '../../types'
import { NO_ACCOUNT, resolveAccountId } from '../../utils/accountSelect'
import { normalizeAmountInput } from '../../utils/amountInput'
import { getApiErrorMessage } from '../../utils/errors'
import { formatAmount, formatQuickPickDate, subtractAmounts } from '../../utils/format'
import { controlHeightClass, destructiveButtonClass, inputClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

/** The amount row's draft: the typed amount plus the currency picked on the
 *  trailing code button. One commit saves both. */
interface AmountDraft {
  amount: string
  code: string
}

/** Whole-row link out of the record: the label on the left, a chevron on the
 *  right, and the row's own control height as its coarse-pointer floor. */
const LINK_ROW_CLASS =
  'flex items-center justify-between gap-3 px-1.5 -mx-1.5 py-1.5 rounded-sm text-sm text-text ' +
  'hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  controlHeightClass

// How long after its payment a paid item may still be waiting for the link
// to its transaction: the background job that creates and links it
// normally lands within seconds.
const PENDING_WINDOW_MS = 5 * 60 * 1000

// Age of a server timestamp in milliseconds. A missing or unparsable value
// reads as infinitely old, so it never keeps the pending line up.
const ageMs = (iso: string | null): number => {
  const at = iso == null ? Number.NaN : Date.parse(iso)
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : Date.now() - at
}

/**
 * The planned item's record: one content component rendered by two hosts -
 * the full-page route at every width for now (the side panel beside the
 * list replaces the 1024+ case later). The HOSTS own data loading (the item
 * query, loading and not-found states) and navigation; the record owns the
 * field rows with their one-field saves and the pay, skip, restore and
 * delete mutations (skip asks first, restore does not). Every save flows through
 * usePlannedFieldSave - a full-replace PUT of the loaded row with one field
 * replaced, no optimistic update: the row shows its saving state until the
 * refetch lands.
 */
export interface PlannedRecordProps {
  /** Fully loaded planned item (the host owns the query plus loading and
   *  error states). Saves flow through usePlannedFieldSave. */
  planned: PlannedTransaction
  /** Host-derived write permission (usePermissions().canWrite at the host).
   *  False renders every row read-only and hides the actions. */
  canWrite: boolean
  /** The item was deleted through the record's own confirm. The host owns
   *  what happens next (the page returns to the list). */
  onDeleted: (planned: PlannedTransaction) => void
  /** Host hooks: the host owns the navigation. */
  onPayDifferently: (planned: PlannedTransaction) => void
  onMakeRecurring: (planned: PlannedTransaction) => void
  onCopy: (planned: PlannedTransaction) => void
}

export default function PlannedRecord({ planned, canWrite, onDeleted, onPayDifferently, onMakeRecurring, onCopy }: PlannedRecordProps) {
  const { t } = useTranslation('planned')
  // Section titles, the autosave line, the link labels, the Category row's
  // label and the invalid-amount message share the transactions wording:
  // one label per concept, read from its owning namespace.
  const { t: tTx } = useTranslation('transactions')
  const { save, isSaving } = usePlannedFieldSave(planned)
  const payment = usePlannedPayment()
  // The item's own stored values ride along: an account or a category
  // archived since the row was saved is missing from the active lists, and
  // the hook adds it back under its stored name, so the row's editor shows
  // it selected instead of an emptied field. The server still rejects a
  // save that names the archived one, until the row is switched.
  const { accountOptions, currencyOptions, categoryOptions } = usePlannedFieldOptions(planned)
  const multiCurrency = useMultiCurrency()
  const queryClient = useQueryClient()

  // An open item (upcoming or overdue) edits in place. A skipped item is
  // read-only. A paid item owns its name only: its amount, date, account
  // and category are whatever its transaction says, so those rows stay
  // read-only. Read-only roles never edit, and a pending field save closes
  // the remaining rows too: each save is a full-replace PUT assembled from
  // the loaded row, so a second edit committed before the refetch lands
  // would revert the first. The gate only blocks opening an editor - one
  // already in progress keeps its draft and settles on its own.
  const isOpenItem = planned.status === 'pending'
  const isPaid = planned.status === 'done'
  const isSkipped = planned.status === 'cancelled'
  const rowsDisabled = !canWrite || isSaving
  const nameDisabled = rowsDisabled || isSkipped
  const valueRowsDisabled = rowsDisabled || !isOpenItem

  // A paid item's amount, date, account and category are read from the
  // transaction its payment created, never from the plan: a payment can
  // book another amount or date, and the transaction can be edited on its
  // own record. The link arrives a moment after the payment (a background
  // job creates the transaction), so the query waits for it.
  const { data: transaction } = useTransaction(isPaid ? planned.transaction_id : null)

  // What the Amount, Date, Account and Category rows show. A paid item reads
  // its transaction; until that is loaded, or when the link is gone because
  // the transaction was deleted, the plan's own record of the payment
  // stands in. Any other item shows the plan as written. The account and
  // category branches test the transaction itself, never a field of it: a
  // loaded transaction with no account or category means exactly that, and
  // only a missing transaction falls back to the plan.
  const values = isPaid
    ? {
        amount: transaction?.amount ?? planned.payment_amount ?? planned.amount,
        currencyCode: transaction?.currency_code ?? planned.currency_code,
        date: transaction?.date ?? planned.payment_date ?? planned.planned_date,
        accountId: transaction ? transaction.account_id : planned.account_id,
        accountName: transaction ? transaction.account_name : planned.account_name,
        categoryId: transaction ? transaction.category_id : planned.category_id,
        categoryName: transaction ? transaction.category_name : planned.category?.name,
      }
    : {
        amount: planned.amount,
        currencyCode: planned.currency_code,
        date: planned.planned_date,
        accountId: planned.account_id,
        accountName: planned.account_name,
        categoryId: planned.category_id,
        categoryName: planned.category?.name,
      }

  // An aliased translator never renders inline: resolve once per render.
  const detailsTitle = tTx('record.detailsTitle')
  const belongsToTitle = tTx('record.belongsToTitle')
  const savesHint = tTx('record.savesHint')
  // The Category row reads "Category": the transactions namespace keeps that
  // word for its items editor, and the form label with "(optional)" is not
  // a record row's wording.
  const categoryLabel = tTx('items.categoryLabel')
  const openAccountAria = values.accountName
    ? tTx('record.openAccountAria', { name: values.accountName })
    : tTx('record.openAccountsAria')
  const openCategoryAria = tTx('record.openCategoryAria', { name: values.categoryName ?? '' })

  // The planned amount under a paid one that differs. The code rides along
  // even in a single-currency workspace: the two amounts must read apart.
  const plannedValue = t('record.plannedValue', { value: formatAmount(planned.amount, planned.currency_code) })
  const paidNote = t('record.paidNote')
  const transactionPendingNote = t('record.transactionPending')
  // Exact cents: comparing the strings would call "100.0" and "100.00"
  // different amounts.
  const paidDiffers =
    isPaid && (values.currencyCode !== planned.currency_code || subtractAmounts(values.amount, planned.amount) !== '0.00')
  // The link to the transaction arrives a moment after the payment, through
  // a background job the detail query polls for. Until then the rows are
  // read-only and no "Open transaction" row exists, so one line says why.
  // The state ends as soon as the plan row carries the link or a
  // transaction is loaded. The time test tells a transaction still being
  // created from one deleted later: deleting it nulls the link without
  // touching updated_at, and the job that lands the link saves that one
  // field only, so updated_at is the payment's own time. An item paid more
  // than a few minutes ago is never waiting. The age is read per render,
  // with no timer.
  const isTransactionPending =
    isPaid && planned.transaction_id == null && !transaction && ageMs(planned.updated_at) < PENDING_WINDOW_MS

  const commitName = (name: string) => save({ name: name.trim() })
  const commitAmount = (draft: AmountDraft) => {
    // Unparseable or non-positive draft: reject so the row restores the
    // previous value without a request the wire would reject anyway.
    const norm = normalizeAmountInput(draft.amount)
    if (norm === null || Number(norm) <= 0) throw new Error(tTx('record.amountInvalid'))
    // The currency button is locked while an account is set, so a changed
    // code only ever leaves an account-less row.
    return save(draft.code === planned.currency_code ? { amount: norm } : { amount: norm, currency_code: draft.code })
  }
  const renderCategoryEditor = (bag: EditorBag<number | null>) => (
    <FieldEditorShell bag={bag} escapeOnly>
      <Select
        value={bag.value}
        onChange={bag.onChange}
        options={categoryOptions}
        placeholder={t('form.uncategorized')}
        aria-label={t('form.categoryAria')}
        className="w-full"
      />
    </FieldEditorShell>
  )

  const [skipAsk, setSkipAsk] = useState(false)
  const [deleteAsk, setDeleteAsk] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => plannedTransactionsApi.delete(planned.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(t('deleted'))
      setDeleteAsk(false)
      onDeleted(planned)
    },
    // A delete confirm has nothing to correct, so it closes on an error
    // too; the toast carries the server's message.
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('deleteFailed')))
      setDeleteAsk(false)
    },
  })

  const confirmSkip = async () => {
    // The hook toasts its own errors and never throws; the dialog stays
    // open with its buttons disabled until the request settles.
    await payment.skip(planned)
    setSkipAsk(false)
  }

  return (
    <div className="space-y-6">
      {/* 1. Summary: the name as plain text (the Name row is its only
            editor), the status chip, the amount. */}
      <div className="space-y-1">
        <p className="text-base font-medium text-text break-words">{planned.name}</p>
        <div className="flex flex-wrap items-center gap-2">
          <PlannedStatusChip planned={planned} />
          <span className="font-mono text-base whitespace-nowrap text-text">
            {formatAmount(values.amount)} {multiCurrency ? values.currencyCode : ''}
          </span>
          {paidDiffers && <p className="font-mono text-xs text-text-muted">{plannedValue}</p>}
        </div>
      </div>

      {/* 2. Actions - writers only, directly under the summary. An open item
          pays, skips, makes recurring and copies; a skipped item restores
          and copies; a paid item is final, so it only copies. Every state
          deletes. There is no footer action row. */}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isOpenItem && (
            <>
              <button
                type="button"
                onClick={() => void payment.markPaid(planned)}
                disabled={payment.isPending}
                className={`inline-flex items-center gap-1.5 ${primaryButtonClass}`}
              >
                <CheckCircle size={14} strokeWidth={1.5} aria-hidden="true" />
                {t('rowActions.markPaid')}
              </button>
              <button
                type="button"
                onClick={() => onPayDifferently(planned)}
                className={`inline-flex items-center gap-1.5 ${secondaryButtonClass}`}
              >
                <SlidersHorizontal size={14} strokeWidth={1.5} aria-hidden="true" />
                {t('rowActions.paidDifferently')}
              </button>
            </>
          )}
          {isSkipped && (
            // Restoring undoes a skip exactly, so it asks for nothing.
            <button
              type="button"
              onClick={() => void payment.restore(planned)}
              disabled={payment.isPending}
              className={`inline-flex items-center gap-1.5 ${secondaryButtonClass}`}
            >
              <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
              {t('record.restore')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onCopy(planned)}
            className={`inline-flex items-center gap-1.5 ${secondaryButtonClass}`}
          >
            <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('rowActions.copy')}
          </button>
          {isOpenItem && planned.recurring_id == null && (
            <button
              type="button"
              onClick={() => onMakeRecurring(planned)}
              className={`inline-flex items-center gap-1.5 ${secondaryButtonClass}`}
            >
              <Repeat size={14} strokeWidth={1.5} aria-hidden="true" />
              {t('recurring.makeRecurring')}
            </button>
          )}
          {isOpenItem && (
            <button
              type="button"
              onClick={() => setSkipAsk(true)}
              disabled={payment.isPending}
              className={`inline-flex items-center gap-1.5 ${secondaryButtonClass}`}
            >
              <Ban size={14} strokeWidth={1.5} aria-hidden="true" />
              {t('rowActions.skip')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleteAsk(true)}
            className={`ml-auto inline-flex items-center gap-1.5 ${destructiveButtonClass}`}
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden="true" />
            {t('rowActions.delete')}
          </button>
        </div>
      )}

      {/* 3. Details: Name, Amount, Date. */}
      <Section title={detailsTitle}>
        <EditableField<string>
          label={t('form.nameLabel')}
          value={planned.name}
          display={<span className="truncate">{planned.name}</span>}
          disabled={nameDisabled}
          renderEditor={(bag) => (
            <input
              value={bag.value}
              onChange={(e) => bag.onChange(e.target.value)}
              maxLength={200} /* mirrors the backend name max_length */
              {...bag.inputProps}
              className={inputClass}
            />
          )}
          onSave={commitName}
        />
        <EditableField<AmountDraft>
          label={t('form.amountLabel')}
          value={{ amount: values.amount, code: values.currencyCode }}
          display={
            <span className="font-mono text-xs whitespace-nowrap">
              {formatAmount(values.amount)} {values.currencyCode}
            </span>
          }
          disabled={valueRowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag}>
              <AmountField
                id="record-planned-amount"
                label={t('form.amountLabel')}
                value={bag.value.amount}
                onChange={(amount) => bag.onChange({ ...bag.value, amount })}
                currency={{
                  label: t('form.currencyLabel'),
                  code: bag.value.code,
                  options: currencyOptions,
                  onChange: (code) => bag.onChange({ ...bag.value, code }),
                  placeholder: t('form.selectCurrency'),
                  locked: values.accountId != null,
                  ariaLabel: t('form.currencyAria'),
                }}
              />
            </FieldEditorShell>
          )}
          onSave={commitAmount}
        />
        <EditableField<string>
          label={t('form.dateLabel')}
          value={values.date}
          display={<span className="font-mono text-xs">{formatQuickPickDate(values.date, 'date')}</span>}
          disabled={valueRowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag} escapeOnly>
              <DateEditor value={bag.value} onChange={bag.onChange} />
            </FieldEditorShell>
          )}
          onSave={(planned_date) => save({ planned_date })}
        />
      </Section>

      {/* 4. Belongs to: Account and Category, each also a link to where the
          value leads. A paid item closes the block with the reason its rows
          are read-only: a disabled row with no explanation reads as broken.
          While the link to its transaction is still missing a moment after
          the payment, one more line says so, for every role. */}
      <div className="space-y-2">
        <Section title={belongsToTitle}>
          <LinkedRow<number | null>
            to={values.accountId != null ? `/accounts/${values.accountId}` : '/accounts'}
            linkLabel={openAccountAria}
            label={t('form.accountLabel')}
            value={values.accountId}
            display={
              values.accountId != null ? (
                <span className="truncate">{values.accountName}</span>
              ) : (
                <span className="text-text-muted">{t('noAccount')}</span>
              )
            }
            disabled={valueRowsDisabled}
            renderEditor={(bag) => (
              <FieldEditorShell bag={bag} escapeOnly>
                <Select
                  value={bag.value ?? NO_ACCOUNT}
                  onChange={(v) => bag.onChange(resolveAccountId(v))}
                  options={accountOptions}
                  placeholder={t('form.selectAccount')}
                  aria-label={t('form.accountAria')}
                  className="w-full"
                />
              </FieldEditorShell>
            )}
            // The save hook owns the account -> currency coupling: switching
            // the account sends the target account's currency with the patch.
            onSave={(account_id) => save({ account_id })}
          />
          {values.categoryId != null ? (
            <LinkedRow<number | null>
              to={`/transactions?category=${values.categoryId}`}
              linkLabel={openCategoryAria}
              label={categoryLabel}
              value={values.categoryId}
              display={<span className="truncate">{values.categoryName}</span>}
              disabled={valueRowsDisabled}
              renderEditor={renderCategoryEditor}
              onSave={(category_id) => save({ category_id })}
            />
          ) : (
            // No category: a plain row without the trailing link - there is
            // nothing to filter by, and an inert arrow is worse than no arrow.
            <EditableField<number | null>
              label={categoryLabel}
              value={null}
              display={<span className="text-text-muted">{t('form.uncategorized')}</span>}
              disabled={valueRowsDisabled}
              renderEditor={renderCategoryEditor}
              onSave={(category_id) => save({ category_id })}
            />
          )}
        </Section>
        {canWrite && isPaid && <p className="text-xs text-text-muted">{paidNote}</p>}
        {isTransactionPending && <p className="text-xs text-text-muted">{transactionPendingNote}</p>}
      </div>

      {/* 5. Links: whole-row navigation out of the record. */}
      {(planned.recurring_id != null || planned.transaction_id != null) && (
        <div className="divide-y divide-border">
          {planned.recurring_id != null && (
            <Link to={`/planned/rules/${planned.recurring_id}`} className={LINK_ROW_CLASS}>
              <span>{t('record.openRule')}</span>
              <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" className="text-text-muted shrink-0" />
            </Link>
          )}
          {planned.transaction_id != null && (
            <Link to={`/transactions/${planned.transaction_id}`} className={LINK_ROW_CLASS}>
              <span>{t('record.openTransaction')}</span>
              <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" className="text-text-muted shrink-0" />
            </Link>
          )}
        </div>
      )}

      {/* 6. Autosave line - writers only, only while a row is editable: the
          Name row stays editable on a paid item. */}
      {canWrite && !isSkipped && <p className="text-xs text-text-muted">{savesHint}</p>}

      <ConfirmDialog
        isOpen={skipAsk}
        title={t('skipDialog.title')}
        message={t('skipDialog.message', { name: planned.name })}
        confirmLabel={t('skipDialog.confirm')}
        destructive={false}
        isPending={payment.isPending}
        onConfirm={confirmSkip}
        onCancel={() => setSkipAsk(false)}
      />
      <ConfirmDialog
        isOpen={deleteAsk}
        title={t('deleteDialog.title')}
        message={t('deleteDialog.message', { name: planned.name })}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setDeleteAsk(false)}
      />
    </div>
  )
}

/**
 * The date row's editor. The calendar popup unmounts on a day pick and the
 * day button that took focus goes with it, so no blur would ever reach the
 * row's blur-commit guard: the picked date would sit unsaved in an editor
 * that never closes. The wrapper hands focus back to the trigger input
 * first, so a pick only changes the draft and the next blur commits, like
 * every other picker row. On phones the one-field sheet's Save button owns
 * the commit, so nothing is refocused there.
 */
function DateEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { isMobile } = useBreakpoint()
  return (
    <div ref={rootRef}>
      <DatePicker
        value={value}
        onChange={(next) => {
          onChange(next)
          if (!isMobile) rootRef.current?.querySelector('input')?.focus()
        }}
        className="w-full"
      />
    </div>
  )
}
