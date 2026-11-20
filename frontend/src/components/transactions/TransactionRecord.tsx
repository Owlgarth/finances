import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, Copy, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import AmountField from './AmountField'
import DateQuickPick from '../common/DateQuickPick'
import EditableField from '../common/EditableField'
import type { EditorBag } from '../common/EditableField'
import LinkedRow from '../common/LinkedRow'
import Modal from '../common/Modal'
import Select from '../common/Select'
import TransactionAttachments from './TransactionAttachments'
import TransactionItemsEditor from './TransactionItemsEditor'
import { budgetsApi, reportsApi } from '../../api/client'
import { useAccounts, useBudgets, useEnabledCurrencies, useMultiCurrency } from '../../hooks/useDomain'
import { NO_ADJUSTMENT } from '../../hooks/useTransactionForm'
import { useTransactionFieldSave, type TransactionFieldPatch } from '../../hooks/useTransactionFieldSave'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import type { Account, Budget, BudgetSummaryItem, Transaction, TransactionType } from '../../types'
import { NO_ACCOUNT, resolveAccountId } from '../../utils/accountSelect'
import { normalizeAmountInput, parseAmountNumber } from '../../utils/amountInput'
import { getApiErrorMessage } from '../../utils/errors'
import { formatAmount } from '../../utils/format'
import { controlHeightClass, destructiveButtonClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../common/formStyles'

// Same semantic color mapping as TYPE_STYLE in pages/Transactions.tsx (second
// consumer; extract at the third). Small-size semantic text color follows the
// shipped ledger idiom here.
const TYPE_STYLE: Record<TransactionType, string> = {
  income: 'text-positive',
  expense: 'text-negative',
  adjustment: 'text-warning',
}

// Sign prefix idiom - copy of SIGN_PREFIX in transactions/TransactionFormFields
// (second consumer; keep in sync). ASCII sign, matching the amount input's
// prefix; the summary's rendered sign below uses the ledger's minus glyph.
const SIGN_PREFIX: Partial<Record<'expense' | 'income', string>> = { expense: '-', income: '+' }

// Key lookup (not a JSX literal) keeps i18next/no-literal-string quiet - same
// shape as TYPE_OPTIONS' labelKey in pages/Transactions.tsx (as const so the
// typed t() sees a literal key union).
const TYPE_LABEL = {
  income: 'type.income',
  expense: 'type.expense',
  adjustment: 'type.adjustment',
} as const

// Progress-fill severity - copy of severityFill in pages/BudgetDetailPage
// (second consumer; keep in sync). Thresholds per design/components.md.
const severityFill = (pct: number) => (pct >= 95 ? 'bg-negative' : pct >= 75 ? 'bg-warning' : 'bg-primary')

// Copy of pickAccountForCurrency in hooks/useTransactionForm.ts (second
// consumer; keep in sync) - per-currency default first, else the first
// account by the backend's display ordering, else null.
const pickAccountForCurrency = (accounts: Account[], currencyCode: string | null | undefined): number | null => {
  if (!currencyCode) return null
  const code = currencyCode.toUpperCase()
  const matches = accounts.filter((a) => a.currency_code.toUpperCase() === code)
  if (matches.length === 0) return null
  return matches.find((a) => a.is_default_for_currency)?.id ?? matches[0].id
}

/**
 * The transaction record: one content component rendered by two hosts - the
 * full-page route below 1024 and the side panel at 1024 and up. The HOSTS
 * own data loading (the transaction query, loading and not-found states),
 * confirm chrome (the delete confirm dialog), and navigation; the record
 * owns the field rows and their one-field saves. Every save flows through
 * useTransactionFieldSave - a full-replace PUT of the loaded row with one
 * field replaced, no optimistic update: the row shows its saving state
 * until the refetch lands. The transaction TYPE is deliberately not
 * editable here (a type change re-validates the whole row, so the path is
 * Duplicate and change the type in the create flow).
 */
export interface TransactionRecordProps {
  /** Fully loaded transaction (the host owns the query plus loading and
   *  error states). Saves flow through useTransactionFieldSave. */
  transaction: Transaction
  /** Host-derived write permission (usePermissions().canWrite at the host).
   *  Passed as a prop - not re-derived here - because the hosts already
   *  compute it for their own chrome and the record stays host-neutral.
   *  False renders every row read-only and hides the Items and Receipt
   *  sections and the footer actions. */
  canWrite: boolean
  /** Host-neutral duplicate hook. The host owns navigation (the create flow
   *  with this row as the copy source). */
  onDuplicate: (transaction: Transaction) => void
  /** Host-neutral delete hook. The host owns the confirm dialog and the
   *  return-to-list navigation. */
  onDelete: (transaction: Transaction) => void
}

export default function TransactionRecord({ transaction, canWrite, onDuplicate, onDelete }: TransactionRecordProps) {
  const { t } = useTranslation('transactions')
  const { save, isSaving } = useTransactionFieldSave(transaction)
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)
  const { data: currencies = [] } = useEnabledCurrencies()
  const multiCurrency = useMultiCurrency()

  const isAuto = transaction.source_transaction_id != null
  const isAdjustment = transaction.type === 'adjustment'
  // Auto-created facet adjustments reject updates (they are managed by their
  // source transaction), and read-only roles never edit: both render the
  // same disabled rows.
  const rowsDisabled = !canWrite || isAuto
  const budgetId = transaction.category_budget_id
  const budget = budgets.find((b) => b.id === budgetId) ?? null
  const [facetOpen, setFacetOpen] = useState(false)

  // Balance for the Account row - the shared current-balances cache family
  // (the Dashboard/Sidebar key), found by account id.
  const { data: balances } = useQuery({
    queryKey: ['current-balances', false],
    queryFn: () => reportsApi.currentBalances(false),
  })
  const balance =
    transaction.account_id != null
      ? balances?.accounts.find((row) => row.account_id === transaction.account_id) ?? null
      : null

  // Period containing the transaction's date. The key carries the DATE so
  // this date-scoped entry can never be served from (or pollute) the budget
  // page's dateless ['current-period', budgetId] cache entry. Custom-cadence
  // budgets have no derived current period - skip the fetch (and wait for
  // the budgets list before deciding, so a custom budget never fires the
  // doomed request).
  const { data: period } = useQuery({
    queryKey: ['current-period', budgetId, transaction.date],
    queryFn: () => budgetsApi.currentPeriod(budgetId!, transaction.date),
    enabled: budgetId != null && budget != null && budget.cadence !== 'custom',
    retry: false,
  })

  // Spent-of-planned for the Category row: same key and queryFn as the
  // budget page's summary (genuine cache sharing), selected down to this
  // category's item. Prefer the item in the transaction's own currency when
  // a category is budgeted in several - deterministic and never converted.
  const { data: summaryItem } = useQuery({
    queryKey: ['budget-summary', budgetId, period?.id],
    queryFn: () => reportsApi.budgetSummary(budgetId!, period!.id),
    enabled: budgetId != null && period != null && transaction.category_id != null,
    select: (summary) =>
      summary.items.find((i) => i.category_id === transaction.category_id && i.currency_code === transaction.currency_code) ??
      summary.items.find((i) => i.category_id === transaction.category_id) ??
      null,
  })

  // Option lists mirror the transaction form's derivations exactly.
  const currencyOptions = currencies.map((c) => ({ value: c.code, label: `${c.code} - ${c.name}` }))
  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))
  // Adjustments must book to an account, so their picker has no sentinel.
  const accountSelectOptions = isAdjustment
    ? accountOptions
    : [{ value: NO_ACCOUNT, label: t('noAccount') }, ...accountOptions]
  const otherCurrencyOptions = currencies
    .filter((c) => c.code !== transaction.currency_code)
    .map((c) => ({ value: c.code, label: c.code }))
  const facetSet = transaction.original_amount != null && transaction.original_currency_code != null
  // The items and receipts editors offer no read-only mode (their buttons
  // would 403 for viewers), and auto rows reject every write - render the
  // sections only for writers on directly-editable rows. Adjustments carry
  // no items by definition.
  const showItems = canWrite && !isAuto && !isAdjustment
  const showReceipts = canWrite && !isAuto

  return (
    <div className="space-y-6">
      {/* 1. Summary: description, signed amount, type chip, auto badge. */}
      <div className="space-y-1">
        <p className="text-base font-medium text-text break-words">{transaction.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-[9px] font-mono uppercase tracking-wider border rounded-sm px-1 ${
              isAdjustment ? 'text-warning border-warning/40' : 'text-text-muted border-border'
            }`}
          >
            {t(TYPE_LABEL[transaction.type])}
          </span>
          {isAuto && (
            <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted border border-border rounded-sm px-1">
              {t('autoBadge')}
            </span>
          )}
          <span className={`font-mono text-base whitespace-nowrap ${TYPE_STYLE[transaction.type]}`}>
            {transaction.type === 'expense' ? '−' : transaction.type === 'income' ? '+' : ''}
            {formatAmount(transaction.amount)} {multiCurrency ? transaction.currency_code : ''}
          </span>
        </div>
        {isAuto && <p className="text-xs text-text-muted">{t('autoBadgeTitle')}</p>}
      </div>

      {/* 2. Details: Date, Description, Amount, Note; plus a Currency row
          only while the row is account-less (with an account, the account
          fixes the currency). */}
      <Section title={t('record.detailsTitle')}>
        <EditableField<string>
          label={t('form.dateLabel')}
          value={transaction.date}
          display={<span className="font-mono text-xs">{transaction.date}</span>}
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag} escapeOnly>
              <DateQuickPick value={bag.value} onChange={bag.onChange} className="w-full" />
            </FieldEditorShell>
          )}
          onSave={(date) => save({ date })}
        />
        <EditableField<string>
          label={t('form.descriptionLabel')}
          value={transaction.description}
          display={<span className="truncate">{transaction.description}</span>}
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <input
              value={bag.value}
              onChange={(e) => bag.onChange(e.target.value)}
              {...bag.inputProps} /* Enter=commit, Escape=cancel, blur=commit */
              className={inputClass}
            />
          )}
          onSave={(description) => save({ description: description.trim() })}
        />
        <EditableField<string>
          label={t(isAdjustment ? 'form.deltaAmountLabel' : 'form.amountLabel')}
          value={transaction.amount}
          display={
            <span className="font-mono text-xs whitespace-nowrap">
              {SIGN_PREFIX[transaction.type as 'expense' | 'income'] ?? ''}{formatAmount(transaction.amount)} {transaction.currency_code}
            </span>
          }
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag}>
              <AmountField
                id="record-amount"
                label={t(isAdjustment ? 'form.deltaAmountLabel' : 'form.amountLabel')}
                value={bag.value}
                onChange={bag.onChange}
                signPrefix={SIGN_PREFIX[transaction.type as 'expense' | 'income']}
              />
            </FieldEditorShell>
          )}
          onSave={(raw) => {
            // Unparseable draft: reject so the row restores the previous
            // value and shows its error line (the editor never commits an
            // amount the wire would reject anyway).
            const norm = normalizeAmountInput(raw)
            if (norm === null) throw new Error(t('record.amountInvalid'))
            return save({ amount: norm })
          }}
        />
        {transaction.account_id == null && (
          <EditableField<string>
            label={t('form.currencyLabel')}
            value={transaction.currency_code}
            display={<span className="font-mono text-xs">{transaction.currency_code}</span>}
            disabled={rowsDisabled}
            renderEditor={(bag) => (
              <FieldEditorShell bag={bag} escapeOnly>
                <Select
                  value={bag.value}
                  onChange={bag.onChange}
                  options={currencyOptions}
                  placeholder={t('form.currencyPlaceholder')}
                  aria-label={t('form.currencyAria')}
                  mono
                  className="w-full"
                />
              </FieldEditorShell>
            )}
            onSave={(currency_code) => save({ currency_code })}
          />
        )}
        <EditableField<string>
          label={t('form.noteLabel')}
          value={transaction.note ?? ''}
          display={
            transaction.note ? (
              <span className="truncate">{transaction.note}</span>
            ) : (
              <span className="text-text-muted">{t('record.noNote')}</span>
            )
          }
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <textarea
              rows={2}
              maxLength={2000} /* mirrors the backend note max_length */
              value={bag.value}
              onChange={(e) => bag.onChange(e.target.value)}
              onBlur={bag.inputProps.onBlur}
              onKeyDown={(e) => {
                // Multiline override: Enter inserts a newline, Escape
                // cancels; commit is blur or the sheet's Save button.
                if (e.key === 'Escape') {
                  e.preventDefault()
                  bag.cancel()
                }
              }}
              className={inputClass}
            />
          )}
          onSave={(note) => save({ note: note.trim() === '' ? null : note })}
        />
      </Section>

      {/* 3. Belongs to: Account (+balance), Budget (+period), Category
          (+spent-of-planned bar). Adjustments carry no category, so nothing
          budget-wise renders for them. */}
      <Section title={t('record.belongsToTitle')}>
        <LinkedRow<number | null>
          to="/accounts" /* per-account destinations arrive with the accounts pages */
          linkLabel={
            transaction.account_name
              ? t('record.openAccountAria', { name: transaction.account_name })
              : t('record.openAccountsAria')
          }
          label={t('form.accountLabel')}
          value={transaction.account_id}
          display={
            transaction.account_id != null ? (
              <span className="truncate">
                {transaction.account_name}
                {balance && (
                  <span className="font-mono text-text-muted"> · {formatAmount(balance.balance)} {balance.currency_code}</span>
                )}
              </span>
            ) : (
              <span className="text-text-muted">{t('noAccount')}</span>
            )
          }
          disabled={rowsDisabled}
          renderEditor={(bag) => (
            <FieldEditorShell bag={bag} escapeOnly>
              <Select
                value={bag.value ?? NO_ACCOUNT}
                onChange={(v) => bag.onChange(resolveAccountId(v))}
                options={accountSelectOptions}
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
        {budgetId != null && budget != null && (
          <LinkedRow<number | null>
            to={period ? `/budgets/${budget.id}?period=${period.id}` : `/budgets/${budget.id}`}
            linkLabel={t('record.openBudgetAria', { name: budget.name })}
            label={t('form.budgetLabel')}
            value={transaction.category_id}
            display={
              <span className="truncate">
                {budget.name}
                {period && <span className="text-text-muted"> · {period.name}</span>}
              </span>
            }
            disabled={rowsDisabled}
            // The same two-select editor as the Category row: the wire has
            // no budget field, so a budget change is only expressible as a
            // category pick - committing from either row sends the same
            // category_id patch.
            renderEditor={(bag) => <CategoryBudgetEditor bag={bag} budgets={budgets} currentBudgetId={budgetId} />}
            onSave={(category_id) => save({ category_id })}
          />
        )}
        {!isAdjustment && (
          <div> {/* one divide-y child: the row + its spent-of-planned bar */}
            {transaction.category_id != null ? (
              <LinkedRow<number | null>
                to={`/transactions?category=${transaction.category_id}`}
                linkLabel={t('record.openCategoryAria', { name: transaction.category_name ?? '' })}
                label={t('form.categoryLabel')}
                value={transaction.category_id}
                display={<span className="truncate">{transaction.category_name}</span>}
                disabled={rowsDisabled}
                renderEditor={(bag) => <CategoryBudgetEditor bag={bag} budgets={budgets} currentBudgetId={budgetId} />}
                onSave={(category_id) => save({ category_id })}
              />
            ) : (
              // No category: a plain row without the trailing link - there
              // is nothing to filter by, and an inert arrow is worse than
              // no arrow.
              <EditableField<number | null>
                label={t('form.categoryLabel')}
                value={null}
                display={<span className="text-text-muted">{t('form.uncategorized')}</span>}
                disabled={rowsDisabled}
                renderEditor={(bag) => <CategoryBudgetEditor bag={bag} budgets={budgets} currentBudgetId={null} />}
                onSave={(category_id) => save({ category_id })}
              />
            )}
            {summaryItem != null && transaction.category_id != null && <SpentOfPlanned item={summaryItem} />}
          </div>
        )}
        {/* Other-currency facet row: present when set; writers get an
            Add/Edit affordance into the three-field modal. Adjustments and
            single-currency workspaces get nothing (the form's gates). */}
        {!isAdjustment && (facetSet || (canWrite && !isAuto && otherCurrencyOptions.length > 0)) && (
          <div className={`flex items-center justify-between gap-3 py-1.5 ${controlHeightClass}`}>
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-text-muted">
              {t('record.otherCurrency')}
            </span>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {facetSet && (
                <span className="truncate font-mono text-xs">
                  {formatAmount(transaction.original_amount!)} {transaction.original_currency_code}
                  {transaction.original_account_id != null && (
                    <span className="text-text-muted">
                      {' · '}{accounts.find((a) => a.id === transaction.original_account_id)?.name}
                    </span>
                  )}
                </span>
              )}
              {canWrite && !isAuto && !isAdjustment && otherCurrencyOptions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFacetOpen(true)}
                  className={
                    facetSet
                      ? ''
                      : 'font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus'
                  }
                >
                  {facetSet ? t('rowActions.edit') : t('record.facetAdd')}
                </button>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* 4. Items / 5. Receipt - the modal tabs' editors, gated to writers
          on directly-editable rows (their buttons assume write access). */}
      {showItems && (
        <Section title={t('record.itemsTitle')}>
          <TransactionItemsEditor transaction={transaction} />
        </Section>
      )}
      {showReceipts && (
        <Section title={t('record.receiptTitle')}>
          <TransactionAttachments transaction={transaction} />
        </Section>
      )}

      {/* 6. Footer - writers only. Duplicate/Delete are host hooks; the
          hosts own the confirm chrome and the navigation. */}
      {canWrite && !isAuto && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="mr-auto text-xs text-text-muted">{t('record.savesHint')}</span>
          <button type="button" onClick={() => onDuplicate(transaction)} className={secondaryButtonClass}>
            <Copy size={13} className="mr-1 inline" aria-hidden="true" /> {t('record.duplicate')}
          </button>
          <button type="button" onClick={() => onDelete(transaction)} className={destructiveButtonClass}>
            <Trash2 size={13} className="mr-1 inline" aria-hidden="true" /> {t('form.delete')}
          </button>
        </div>
      )}

      {facetOpen && (
        <FacetModal
          transaction={transaction}
          otherCurrencyOptions={otherCurrencyOptions}
          accounts={accounts}
          onClose={() => setFacetOpen(false)}
          save={save}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}

/**
 * Blur/keyboard shell for non-input editors (DateQuickPick, Select pairs,
 * AmountField). React's onBlur is the bubbling focusout, so a bare wrapper
 * would commit when focus moves BETWEEN the editor's own children (budget
 * Select -> category Select) - guard on relatedTarget containment. The
 * bag's own blur handler still carries the mobile-sheet guard (inside the
 * sheet, the Save button owns commit) and the detached-DOM guard, so this
 * shell only widens where the blur is observed from, never re-implements
 * its semantics.
 */
function FieldEditorShell<T>({ bag, children, escapeOnly = false }: {
  bag: EditorBag<T>
  children: ReactNode
  /** Select/DateQuickPick editors pass true: Enter belongs to the control
   *  (Select opens its panel, segments activate), only Escape cancels. The
   *  amount editor passes false and gets the bag's full Enter/Escape. */
  escapeOnly?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      className="w-full max-w-[320px]"
      onBlur={(e) => {
        if (ref.current?.contains(e.relatedTarget)) return // stayed inside the editor
        bag.inputProps.onBlur(e)
      }}
      onKeyDown={(e) => {
        if (escapeOnly) {
          if (e.key === 'Escape') {
            e.preventDefault()
            bag.cancel()
          }
          return
        }
        bag.inputProps.onKeyDown(e)
      }}
    >
      {children}
    </div>
  )
}

/**
 * The two-select budget + category editor used by BOTH the Budget row and
 * the Category row. The wire has no budget field: a budget change is only
 * expressible as a category_id change, so switching the budget inside the
 * editor clears the category pick (the category must belong to the picked
 * budget). EditableField mounts this only while editing, so the useState
 * initializer runs fresh per editing session - that IS the editor session.
 */
function CategoryBudgetEditor({ bag, budgets, currentBudgetId }: {
  bag: EditorBag<number | null>
  budgets: Budget[]
  currentBudgetId: number | null
}) {
  const { t } = useTranslation('transactions')
  const { workspace } = useWorkspace()
  // Budget default mirrors the transaction form: the one budget, else the
  // workspace default, else null (placeholder; category disabled).
  const defaultBudgetId = budgets.length === 1
    ? budgets[0].id
    : budgets.find((b) => b.id === workspace?.default_budget_id)?.id ?? null
  const [sessionBudgetId, setSessionBudgetId] = useState<number | null>(currentBudgetId ?? defaultBudgetId)
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', sessionBudgetId], // same key family as the budget page and items editor
    queryFn: () => budgetsApi.listCategories(sessionBudgetId!),
    enabled: sessionBudgetId != null,
  })
  return (
    <FieldEditorShell bag={bag} escapeOnly>
      <div className="space-y-2">
        {budgets.length > 1 && (
          <Select
            value={sessionBudgetId}
            onChange={(v) => {
              setSessionBudgetId(v)
              // Budget switch clears the category within the editor
              // session: the pick must belong to the new budget's list.
              bag.onChange(null)
            }}
            options={budgets.map((b) => ({ value: b.id, label: b.name }))}
            placeholder={t('form.budgetPlaceholder')}
            aria-label={t('form.budgetLabel')}
            className="w-full"
          />
        )}
        <Select
          value={bag.value}
          onChange={bag.onChange}
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
          placeholder={t('form.uncategorized')}
          aria-label={t('form.categoryAria')}
          disabled={sessionBudgetId == null}
          className="w-full"
        />
      </div>
    </FieldEditorShell>
  )
}

/**
 * The other-currency facet editor: amount, currency, and linked adjustment
 * account in one modal. Mount-per-use - the caller's conditional render IS
 * the open/close mechanism, so the useState initializers seed from the
 * transaction fresh on every open. Facet semantics mirror the transaction
 * form: the no-adjustment sentinel, a currency switch re-picking the
 * account (a previous pick holds the old currency), account options limited
 * to active accounts holding the facet currency, and a stored
 * informational-only facet (no account) staying account-less rather than
 * auto-picking - silently booking the linked adjustment on an untouched
 * save is exactly what the form avoids. Remove is immediate: the modal
 * itself is the confirmation surface, a second confirm dialog would ask
 * the same question twice.
 */
function FacetModal({ transaction, otherCurrencyOptions, accounts, onClose, save, isSaving }: {
  transaction: Transaction
  otherCurrencyOptions: { value: string; label: string }[]
  accounts: Account[]
  onClose: () => void
  save: (patch: TransactionFieldPatch) => Promise<unknown>
  isSaving: boolean
}) {
  const { t } = useTranslation('transactions')
  const [amount, setAmount] = useState(transaction.original_amount ?? '')
  const [currency, setCurrency] = useState<string | null>(
    transaction.original_currency_code ?? otherCurrencyOptions[0]?.value ?? null,
  )
  const [accountId, setAccountId] = useState<number | null>(
    transaction.original_account_id != null
      ? transaction.original_account_id
      : transaction.original_currency_code != null
        ? null // stored informational-only facet: keep it account-less
        : pickAccountForCurrency(accounts, otherCurrencyOptions[0]?.value ?? null),
  )
  const [error, setError] = useState<string | null>(null)
  // Sentinel FIRST, then active accounts holding the facet currency - the
  // only legal adjustment targets. Plain names - every option shares one
  // currency, so a code suffix would be noise.
  const adjustmentAccountOptions = [
    { value: NO_ADJUSTMENT, label: t('form.noAdjustment') },
    ...accounts
      .filter((a) => currency != null && a.currency_code.toUpperCase() === currency.toUpperCase())
      .map((a) => ({ value: a.id, label: a.name })),
  ]

  async function persist(patch: TransactionFieldPatch) {
    try {
      await save(patch)
      onClose() // stays open on error so the field can be corrected
    } catch (err) {
      // The save hook rejects without toasting; the modal is the error
      // surface of last resort, so the message surfaces here.
      toast.error(getApiErrorMessage(err, t('form.saveFailed')))
    }
  }

  function handleSave() {
    const norm = amount.trim() === '' ? null : normalizeAmountInput(amount)
    if (norm === null) {
      setError(amount.trim() === '' ? t('form.amountRequired') : t('record.amountInvalid'))
      return
    }
    if (currency == null) {
      setError(t('form.chooseCurrency'))
      return
    }
    setError(null)
    void persist({ original_amount: norm, original_currency_code: currency, original_account_id: accountId })
  }

  return (
    <Modal open onClose={onClose} title={t('record.otherCurrency')} size="sm" className="p-4">
      <div className="space-y-3">
        <div>
          <label htmlFor="record-facet-amount" className={labelClass}>{t('form.originalAmountPlaceholder')}</label>
          <input
            id="record-facet-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setError(null)
            }}
            className={`${inputClass} ${error ? 'bg-negative-bg border-negative ring-1 ring-negative' : ''}`}
          />
          {error && (
            <div role="alert" className="mt-1 flex items-center gap-1 text-[11px] text-negative font-medium">
              <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div>
          <label className={labelClass}>{t('form.currencyLabel')}</label>
          <Select
            value={currency}
            onChange={(code) => {
              setCurrency(code)
              setAccountId(pickAccountForCurrency(accounts, code)) // a previous pick holds the old currency
            }}
            options={otherCurrencyOptions}
            placeholder={t('form.currencyPlaceholder')}
            aria-label={t('form.originalCurrencyAria')}
            mono
            className="w-full"
          />
        </div>
        <div>
          <label className={labelClass}>{t('form.adjustmentAccountLabel')}</label>
          <Select
            value={accountId ?? NO_ADJUSTMENT}
            onChange={(v) => setAccountId(v === NO_ADJUSTMENT ? null : v)}
            options={adjustmentAccountOptions}
            placeholder={t('form.selectAccount')}
            aria-label={t('form.adjustmentAccountAria')}
            className="w-full"
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void persist({ original_amount: null, original_currency_code: null, original_account_id: null })}
            className={destructiveButtonClass}
          >
            {t('record.facetRemove')}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={isSaving} className={secondaryButtonClass}>{t('form.cancel')}</button>
            <button type="button" onClick={handleSave} disabled={isSaving} className={primaryButtonClass}>
              {isSaving ? t('form.saving') : t('form.save')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** One titled block of divide-y rows. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">{title}</div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}

/**
 * Spent-of-planned line for the Category row, rendered in the SUMMARY
 * item's currency (never converted - a sum across currencies is
 * meaningless). Display-only ratio math; the bar mirrors the budget page's
 * meter (4px track, semantic fill, aria-hidden - the text carries the
 * status without color).
 */
function SpentOfPlanned({ item }: { item: BudgetSummaryItem }) {
  const { t } = useTranslation('transactions')
  const planned = parseAmountNumber(item.planned) ?? 0
  const actual = parseAmountNumber(item.actual) ?? 0
  const pct = planned > 0 ? (actual / planned) * 100 : 0 // display-only ratio
  return (
    <div className="pb-2">
      <div className="text-[10px] font-mono text-text-muted">
        {t('record.spentOf', {
          spent: formatAmount(item.actual, item.currency_code),
          planned: formatAmount(item.planned, item.currency_code),
        })}
      </div>
      <div aria-hidden="true" className="mt-1 block w-full h-1 bg-surface-muted rounded-none overflow-hidden">
        <div className={`block h-full rounded-none transition-all ${severityFill(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  )
}
