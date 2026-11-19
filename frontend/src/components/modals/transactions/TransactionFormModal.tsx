import { useEffect, useId, useRef } from 'react'
import { Copy, Plus, Trash2, Upload, Loader2, CloudOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../DatePicker'
import TransactionItemsEditor from '../../transactions/TransactionItemsEditor'
import TransactionItemsList from '../../transactions/TransactionItemsList'
import TransactionAttachments from '../../transactions/TransactionAttachments'
import type { ParsedReceipt, Transaction } from '../../../types'
import { useExtractionConfig } from '../../../hooks/useDomain'
import { useIsTouch } from '../../../hooks/useBreakpoint'
import { NO_ACCOUNT } from '../../../utils/accountSelect'
import { listboxPanelClass } from '../../common/listboxParts'
import { controlHeightClass, destructiveButtonClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'
import { NO_ADJUSTMENT, useTransactionForm } from '../../../hooks/useTransactionForm'

interface Props {
  open: boolean
  onClose: () => void
  transaction?: Transaction | null
  /** Copy mode: prefill every field from this transaction except the date
      (today instead) and save as a NEW transaction. Ignored while editing. */
  copyFrom?: Transaction | null
  /** Edit mode only: renders a Delete button in the footer. Caller owns the
      confirm flow (and closing this modal). */
  onDelete?: (transaction: Transaction) => void
  /** Edit mode only: renders a Copy button in the footer. Caller switches the
      modal into copy mode (transaction=null, copyFrom=t). */
  onCopy?: (transaction: Transaction) => void
  /** Receipt-first create entry (BottomNav "From receipt"): seeds amount/date/
      description + the editable items list + the pending attachment from an
      *already-parsed* receipt. Applied at most once per receipt object: the
      parent sets it before flipping open and clears it on close, and a
      receipt arriving while the modal is already open is ignored - it never
      re-seeds mid-edit. Ignored unless create mode (no transaction/copyFrom). */
  prefillReceipt?: { file: File; parsed: ParsedReceipt } | null
}

/** Edit-mode detail tabs below the form. Internal keys only - the button
 *  labels resolve through t(). */
const DETAIL_TABS = ['items', 'receipts'] as const

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

export default function TransactionFormModal({ open, onClose, transaction, copyFrom, onDelete, onCopy, prefillReceipt = null }: Props) {
  const { t } = useTranslation('transactions')
  const isEdit = !!transaction
  // No autofocus on touch: focusing an input on open yanks the keyboard up
  // over the fresh modal. The user taps the field they want first.
  const isTouch = useIsTouch()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()
  const fileRef = useRef<HTMLInputElement>(null)
  // The textarea this disclosure swaps in, plus a one-shot flag set in the
  // toggle's onClick and consumed by the effect below. The flag distinguishes
  // a user-initiated expansion (focus the textarea) from the open-effect's
  // pre-expanded edit/copy path (setNoteOpen(true) for a note-carrying
  // source), which must leave the amount field's autoFocus in charge -
  // same event-to-effect signaling shape as Register's failedSubmitRef.
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const noteOpenedByUserRef = useRef(false)
  const descListId = useId()
  const noteId = useId()

  // The flat destructure keeps the JSX below byte-identical to HEAD: every
  // name the markup reads is in scope under the same name.
  const {
    date, description, type, amount, accountId, currencyCode, budgetId, categoryId,
    otherCurrency, originalAmount, originalCurrencyCode, originalAccountId,
    note, noteOpen, pendingRows, budgets, highlighted, detailTab,
    suggestions, showSuggestions,
    setDate, setDescription, setType, setAmount, setBudgetId, setCategoryId,
    setOtherCurrency, setOriginalAmount, setCurrencyCode, setNote, setNoteOpen,
    setPendingRows, setHighlighted, setSuggestionsOpen, setDetailTab,
    handleAccountChange, handleOriginalCurrencyChange, handleAdjustmentAccountChange,
    handleDescriptionKeyDown,
    budgetOptions, categoryOptions, typeOptions, accountSelectOptions,
    currencyOptions, otherCurrencyOptions, adjustmentAccountOptions,
    parse, parseFile, submit, isSaving,
  } = useTransactionForm({ open, transaction, copyFrom, prefillReceipt })

  const handleFile = (f: File | null) => {
    if (!f) return
    parseFile(f)
    // Same-file reselect must re-fire onChange; the File object is already
    // captured by the hook's parseFile, so clearing the input value is safe.
    // Without this, re-selecting the same file fires no change event (silent
    // no-op).
    if (fileRef.current) fileRef.current.value = ''
  }

  // Session-boundary host sync: clear the file input's DOM value at every
  // session boundary (the open flip or a mid-open mode swap), keyed on the
  // same discriminators as the hook's seeding session (the hook resets its
  // parse mutation at the same boundary).
  useEffect(() => {
    if (!open) return
    if (fileRef.current) fileRef.current.value = ''
  }, [open, transaction, copyFrom])

  // Disclosure expansion swaps the toggle button for the textarea (the
  // button unmounts, focus falls to <body>). Focus the freshly mounted
  // textarea so keyboard users land where the click put them - only on the
  // user's own expansion, and only with a fine pointer: on touch,
  // programmatic focus yanks the on-screen keyboard over the fresh field
  // (same rationale as the isTouch comment above and the amount field's
  // autoFocus={!isTouch}). Focus-only effect: no setState, so
  // react-hooks/set-state-in-effect stays quiet (same shape as
  // CommandPalette's input focus).
  useEffect(() => {
    if (!noteOpen || !noteOpenedByUserRef.current) return
    noteOpenedByUserRef.current = false
    if (!isTouch) noteRef.current?.focus()
  }, [noteOpen, isTouch])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await submit()
    if (result.ok) onClose()
  }

  return (
    <Modal open={open} onClose={onClose} className="p-6 max-h-[90vh] overflow-y-auto" title={isEdit ? t('form.editTitle') : t('form.newTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Inline receipt scan — create mode only, hidden when extraction is disabled. */}
        {!isEdit && extractionEnabled && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={parse.isPending || !extractionReachable}
              title={extractionReachable ? undefined : t('form.scannerOfflineTitle')}
              className={`${secondaryButtonClass} disabled:hover:bg-surface inline-flex items-center gap-1`}
            >
              {parse.isPending ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> {t('form.reading')}
                </>
              ) : extractionReachable ? (
                <>
                  <Upload size={13} /> {t('form.uploadReceipt')}
                </>
              ) : (
                <>
                  <CloudOff size={13} /> {t('form.scanningOffline')}
                </>
              )}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelClass}>{t('form.typeLabel')}</label>
            <Select
              value={type}
              onChange={(v) => {
                setType(v)
                // Suggestions are per-type: the panel stays closed until the
                // new type's list arrives and the user interacts again.
                setHighlighted(-1)
                setSuggestionsOpen(false)
              }}
              options={typeOptions}
              aria-label={t('form.typeAria')}
              className="w-full"
            />
          </div>
          <div>
            <label htmlFor="tx-amount" className={labelClass}>
              {type === 'adjustment' ? t('form.deltaAmountLabel') : t('form.amountLabel')} {currencyCode ? `(${currencyCode})` : ''}
            </label>
            {/* text (not number): browsers strip comma entry from number
                inputs before JS sees it, so comma-decimal typing must be
                received as text and parsed at submit (normalizeAmountInput). */}
            <input id="tx-amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} autoFocus={!isTouch} />
          </div>
          {/* Date completes the row at sm+ (type | amount | date); below sm the
              two-column span hands it a full-width row under the pair. The
              right-anchored desktop popup stays inside the panel from this
              last-column cell. */}
          <div className="col-span-2 sm:col-span-1">
            <label className={labelClass}>{t('form.dateLabel')}</label>
            <DatePicker value={date} onChange={setDate} align="right" />
          </div>
        </div>

        <div>
          <label htmlFor="tx-desc" className={labelClass}>{t('form.descriptionLabel')}</label>
          <div className="relative">
            <input
              id="tx-desc"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                // Re-filtering moves the rows; a stale highlight could point
                // past the end of the shrunken list.
                setHighlighted(-1)
              }}
              onFocus={() => setSuggestionsOpen(true)}
              // Delayed close: clicking a suggestion row blurs the input
              // first - closing synchronously would unmount the row before
              // the click lands.
              onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
              onKeyDown={handleDescriptionKeyDown}
              className={inputClass}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls={showSuggestions ? descListId : undefined}
              aria-activedescendant={highlighted >= 0 ? `${descListId}-opt-${highlighted}` : undefined}
            />
            {showSuggestions && (
              // max-w-full caps the fit-widest panel at the description
              // field's width - frequent descriptions can be arbitrarily
              // long (max-width clamps width regardless of class order).
              <div id={descListId} role="listbox" aria-label={t('form.frequentAria')} className={listboxPanelClass + ' max-w-full'}>
                {suggestions.map((s, i) => (
                  <button
                    key={s.description}
                    id={`${descListId}-opt-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === highlighted}
                    tabIndex={-1}
                    onClick={() => {
                      setDescription(s.description)
                      setSuggestionsOpen(false)
                      setHighlighted(-1)
                    }}
                    className={
                      'w-full flex items-center px-2 text-left text-xs text-text transition-colors ' +
                      `${controlHeightClass} ` +
                      (i === highlighted ? 'bg-surface-hover ' : 'hover:bg-surface-hover ')
                    }
                  >
                    <span className="truncate">{s.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Note disclosure (accordion wiring: the collapsed toggle carries
            aria-expanded + aria-controls; the field region is its sibling).
            Collapsed by default so the form stays compact; the textarea
            replaces the button once opened. */}
        {noteOpen ? (
          <div id={noteId} role="region" aria-label={t('form.noteAria')}>
            <label htmlFor="tx-note" className={labelClass}>{t('form.noteLabel')}</label>
            <textarea
              ref={noteRef}
              id="tx-note"
              rows={3}
              /* Mirrors the backend note max_length: an over-long note is
                 stopped at input, not rejected with a 422 on save. */
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { noteOpenedByUserRef.current = true; setNoteOpen(true) }}
            aria-expanded={noteOpen}
            aria-controls={noteId}
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors max-sm:min-h-[44px]"
          >
            <Plus size={13} /> {t('form.addNote')}
          </button>
        )}

        {/* Always rendered: recording money without an account (cash exchanged
            while traveling, a closed account's history) is a first-class path. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('form.accountLabel')}</label>
            <Select
              value={accountId ?? NO_ACCOUNT}
              onChange={handleAccountChange}
              options={accountSelectOptions}
              placeholder={t('form.selectAccount')}
              aria-label={t('form.accountAria')}
              className="w-full"
            />
          </div>
          <div>
            <label className={labelClass}>{t('form.currencyLabel')}</label>
            <Select
              value={currencyCode}
              onChange={setCurrencyCode}
              options={currencyOptions}
              placeholder={t('form.currencyPlaceholder')}
              aria-label={t('form.currencyAria')}
              disabled={accountId !== null}
              mono
              className="w-full"
            />
          </div>
        </div>

        {type !== 'adjustment' && (
          <div className="grid grid-cols-2 gap-3">
            {budgets.length > 1 && (
              <div>
                <label className={labelClass}>{t('form.budgetLabel')}</label>
                <Select value={budgetId} onChange={(v) => { setBudgetId(v); setCategoryId(null) }} options={budgetOptions} placeholder={t('form.budgetPlaceholder')} aria-label={t('form.budgetAria')} className="w-full" />
              </div>
            )}
            <div className={budgets.length > 1 ? '' : 'col-span-2'}>
              <label className={labelClass}>{t('form.categoryLabel')}</label>
              <Select value={categoryId} onChange={setCategoryId} options={categoryOptions} placeholder={t('form.uncategorized')} aria-label={t('form.categoryAria')} disabled={!budgetId} className="w-full" />
            </div>
          </div>
        )}

        {type !== 'adjustment' && otherCurrencyOptions.length > 0 && (
          <div>
            <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer">
              <input type="checkbox" checked={otherCurrency} onChange={(e) => setOtherCurrency(e.target.checked)} />
              {t('form.otherCurrency')}
            </label>
            {otherCurrency && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input type="text" inputMode="decimal" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} placeholder={t('form.originalAmountPlaceholder')} className={inputClass} />
                <Select value={originalCurrencyCode} onChange={handleOriginalCurrencyChange} options={otherCurrencyOptions} placeholder={t('form.currencyPlaceholder')} aria-label={t('form.originalCurrencyAria')} mono className="w-full" />
                <div className="col-span-2">
                  <label className={labelClass}>{t('form.adjustmentAccountLabel')}</label>
                  <Select
                    value={originalAccountId ?? NO_ADJUSTMENT}
                    onChange={handleAdjustmentAccountChange}
                    options={adjustmentAccountOptions}
                    placeholder={t('form.selectAccount')}
                    aria-label={t('form.adjustmentAccountAria')}
                    className="w-full"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Editable line items — create mode only. Edit mode has its own items tab below. */}
        {/* Adjustments never get coverage items: no category is allowed on them, so
            per-item categories and the remainder preview do not apply. Rows stay in
            state across a type switch (an accidental adjustment toggle must not wipe
            typed items); the payload gate below keeps them off the wire. */}
        {!isEdit && type !== 'adjustment' && (
          <TransactionItemsList
            rows={pendingRows}
            onChange={setPendingRows}
            amount={amount}
            currencyCode={currencyCode}
            categoryOptions={categoryOptions}
            transactionCategoryId={categoryId}
            remainderReadOnly
          />
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {/* Two separate, individually clickable actions (never a menu). */}
          {isEdit && transaction && (
            <div className="flex items-center gap-2">
              {onCopy && (
                <button type="button" onClick={() => onCopy(transaction)} className={secondaryButtonClass}>
                  <Copy size={13} className="inline mr-1" /> {t('form.copy')}
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(transaction)} className={destructiveButtonClass}>
                  <Trash2 size={13} className="inline mr-1" /> {t('form.delete')}
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('form.cancel')}</button>
            <button type="submit" disabled={isSaving} className={primaryButtonClass}>
              {isSaving ? t('form.saving') : isEdit ? t('form.save') : t('form.add')}
            </button>
          </div>
        </div>
      </form>

      {isEdit && transaction && (
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center gap-1 mb-3">
            {DETAIL_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDetailTab(tab)}
                className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors ${
                  detailTab === tab ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
                }`}
              >
                {t(tab === 'items' ? 'form.tabs.items' : 'form.tabs.receipts')}
              </button>
            ))}
          </div>
          {detailTab === 'items' && <TransactionItemsEditor transaction={transaction} />}
          {detailTab === 'receipts' && <TransactionAttachments transaction={transaction} />}
        </div>
      )}
    </Modal>
  )
}
