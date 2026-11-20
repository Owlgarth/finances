import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AlertCircle, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Select from '../common/Select'
import { inputClass, primaryButtonClass } from '../common/formStyles'
import { useTransactionForm } from '../../hooks/useTransactionForm'
import { hasActiveOverlay } from '../../hooks/useOverlay'
import { NO_ACCOUNT } from '../../utils/accountSelect'

/** Sign prefix shown at the amount input's left edge, keyed by type. A
 *  record lookup, not a JSX literal, keeps the literal-string lint quiet
 *  (TransactionFormFields carries the same map). Decorative
 *  (aria-hidden): the typed sign carries the state; the prefix mirrors
 *  it. */
const SIGN_PREFIX: Partial<Record<'expense' | 'income', string>> = { expense: '-', income: '+' }

interface TransactionAddRowProps {
  /** Create seed: the active account filter when it resolves to exactly
   *  one account, else null. Latched once at mount - a later filter
   *  change never re-seeds an already-mounted row. */
  initialAccountId: number | null
  /** False while an in-flow panel is open (the side record panel; a
   *  create panel keyed on a URL param). In-flow panels are page flow,
   *  not overlays, so the hotkey's overlay check cannot catch them -
   *  firing the hotkey behind one would steal its focus. */
  hotkeyEnabled: boolean
}

/** The ledger table's inline create row: a compact always-open create
 *  form as the table's first body row, followed by a reserved
 *  fixed-height status row so a validation error can never shift the
 *  table. The account and category cells carry the same container-gate
 *  classes as the data cells, so the row mirrors the visible column set
 *  at every table width. Enter saves and re-arms for the next entry; the
 *  amount's leading sign ('+' income, '-' or none expense) picks the
 *  type per entry. Neither row is a data row: the table's row-selection
 *  keyboard handler matches data rows only, and its form-control guard
 *  leaves these inputs' own keys alone. */
export default function TransactionAddRow({ initialAccountId, hotkeyEnabled }: TransactionAddRowProps) {
  const { t } = useTranslation('transactions')
  const descRef = useRef<HTMLInputElement | null>(null)

  // Read-once seed: a mounted row never re-seeds when the account filter
  // changes underneath it (the create page's URL seed follows the same
  // read-once contract).
  const [seedAccountId] = useState(() => initialAccountId)

  // Mount IS open - the row stays mounted while visible, so the form runs
  // in create mode from the first render. Validation toasts are off:
  // errors render in the reserved status row instead. The save success
  // toast stays on (the hook keeps it either way).
  const form = useTransactionForm({
    open: true,
    validationToasts: false,
    initialAccountId: seedAccountId,
    // initialType omitted: expense is the hook's create default.
  })

  // Inline-error display gate: an error shows after its field's first
  // invalid USER blur or after any submit attempt; once shown it tracks
  // keystrokes because the form hook re-derives errors every render. The
  // interaction arm ignores programmatic focus: the hotkey's focus call
  // must not latch an error onto a pristine row, while every real focus
  // change takes a pointer or key event first, so any blur that follows
  // one is a user blur.
  const [touched, setTouched] = useState<Partial<Record<'description' | 'amount', boolean>>>({})
  const userInteractedRef = useRef(false)
  useEffect(() => {
    const mark = () => {
      userInteractedRef.current = true
    }
    document.addEventListener('pointerdown', mark, true)
    document.addEventListener('keydown', mark, true)
    return () => {
      document.removeEventListener('pointerdown', mark, true)
      document.removeEventListener('keydown', mark, true)
    }
  }, [])
  const markTouched = (key: 'description' | 'amount') => {
    if (!userInteractedRef.current) return
    setTouched((prev) => ({ ...prev, [key]: true }))
  }
  const showAll = form.submitCount > 0
  const showError = (key: 'description' | 'amount'): string | undefined =>
    (touched[key] || showAll) && form.errors[key] ? form.errors[key] : undefined
  // The reserved row shows the FIRST error whose display gate is open -
  // the form hook's precedence: description before amount.
  const statusError = showError('description') ?? showError('amount')

  const handleAdd = async () => {
    if (form.isSaving) return
    const { ok } = await form.submit()
    if (!ok) return
    form.resetForAnother()
    // The reset keeps the type, but this row derives the type from EACH
    // entry's own sign: an unsigned next entry is expense again, so the
    // visible prefix never lies about what an unsigned amount would save
    // as.
    form.setType('expense')
    // Keyboard-first entry: focus stays in the row for the next one.
    // Order is load-bearing: the focus change blurs the amount input,
    // and that blur latches touched - the clear below must queue AFTER
    // it or the fresh row would greet the user with "Amount is
    // required".
    descRef.current?.focus()
    // The hook zeroes its own submit counter at the reset boundary; the
    // touched map is host state, so it resets here - the next entry's
    // errors wait for their own blur or submit.
    setTouched({})
  }

  /** Enter saves from the free-text inputs. Per-input interception,
   *  never a row-level handler: a row-level hijack would also fire on
   *  the focused Add button (double activation) and on the Select
   *  triggers, where Enter belongs to the listbox. */
  const onEnterSave = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void handleAdd()
  }

  /** Leading-sign translation: '+' types income; '-' or an unsigned
   *  value types expense - the type derives from EACH entry's own sign,
   *  so a '+' entry never silently colors the next unsigned one. The
   *  sign never lands in the amount value (the amount normalizer
   *  accepts an optional leading '-' only - a kept '+' would fail
   *  validation): it drives the type and shows as the decorative prefix
   *  instead. */
  const handleAmountChange = (raw: string) => {
    if (raw.startsWith('+')) {
      form.setType('income')
      form.setAmount(raw.slice(1))
      return
    }
    if (raw.startsWith('-')) {
      form.setType('expense')
      form.setAmount(raw.slice(1))
      return
    }
    // An unsigned draft KEEPS the entry's current type: the sign was
    // consumed above (a leading '+' set income; the digits typed after
    // it must not flip the entry back to expense). The expense default
    // for unsigned entries comes from the fresh-row default and the
    // post-save reset, so income can never carry into the next entry;
    // and clearing the draft drops a typed sign's effect with it.
    if (raw === '') form.setType('expense')
    form.setAmount(raw)
  }

  // "N" focuses the description input. Gates: no modifiers; no
  // input/textarea/select/contentEditable focused; no blocking overlay;
  // no open listbox panel (Select triggers are buttons with their own
  // type-ahead, so the focused-element gate alone would let N fight an
  // open dropdown); and the host reports no in-flow panel open.
  // Mounting already implies the writer role, the desktop tier, and the
  // list view.
  useEffect(() => {
    if (!hotkeyEnabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (
        el instanceof HTMLElement &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      ) return
      if (hasActiveOverlay()) return
      if (document.querySelector('[role="listbox"]')) return
      e.preventDefault()
      descRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [hotkeyEnabled])

  const signPrefix = SIGN_PREFIX[form.type as 'expense' | 'income']

  return (
    <>
      {/* No zebra on the create row; focus-within marks the active entry
          row (a pseudo-class variant safely out-specifies the base bg). */}
      <tr className="bg-surface border-b border-border focus-within:bg-surface-hover transition-colors">
        <td className="px-1 py-1">
          {/* Native date input: keyboard-navigable with arrow keys, and
              its yyyy-mm-dd value shape matches the hook's date string. */}
          <input
            type="date"
            value={form.date}
            onChange={(e) => form.setDate(e.target.value)}
            onKeyDown={onEnterSave}
            aria-label={t('form.dateLabel')}
            className={inputClass}
          />
        </td>
        <td className="px-1 py-1">
          <input
            ref={descRef}
            type="text"
            value={form.description}
            onChange={(e) => form.setDescription(e.target.value)}
            onKeyDown={(e) => {
              // The form hook's combobox handler first: should a
              // suggestion panel ever be wired here, its Enter acceptance
              // wins (it prevents default). No panel opens in this
              // compact row today.
              form.handleDescriptionKeyDown(e)
              if (e.defaultPrevented) return
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleAdd()
              }
            }}
            onBlur={() => markTouched('description')}
            aria-label={t('form.descriptionLabel')}
            className={`${inputClass} ${showError('description') ? 'bg-negative-bg border-negative ring-1 ring-negative ' : ''}`}
          />
        </td>
        {/* The account and category cells carry the data cells'
            container-gate classes, so the row mirrors the visible column
            set by construction at every table width. */}
        <td className="px-1 py-1 hidden @min-[760px]:table-cell">
          <Select
            value={form.accountId ?? NO_ACCOUNT}
            onChange={form.handleAccountChange}
            options={form.accountSelectOptions}
            placeholder={t('form.selectAccount')}
            aria-label={t('form.accountAria')}
            className="w-full"
          />
        </td>
        <td className="px-1 py-1 hidden @min-[560px]:table-cell">
          <Select
            value={form.categoryId}
            onChange={form.setCategoryId}
            options={form.categoryOptions}
            placeholder={t('form.uncategorized')}
            aria-label={t('form.categoryAria')}
            disabled={!form.budgetId}
            className="w-full"
          />
        </td>
        {/* Amount and Add share the last cell: the ledger has no Add
            column, and a lone extra cell would break column alignment.
            The input stays left-aligned with its prefix (the form-input
            idiom); saved rows render right-aligned like every ledger
            row. */}
        <td className="px-1 py-1">
          <div className="flex items-center gap-1">
            <div className="relative flex-1 min-w-0">
              {signPrefix && (
                <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 font-mono text-xs text-text-muted">
                  {signPrefix}
                </span>
              )}
              {/* text (not number) with a decimal input mode: the leading
                  sign the user types must reach the change handler as
                  text. */}
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                onKeyDown={onEnterSave}
                onBlur={() => markTouched('amount')}
                aria-label={t('form.amountLabel')}
                className={`${inputClass} ${signPrefix ? 'pl-6 ' : ''}${showError('amount') ? 'bg-negative-bg border-negative ring-1 ring-negative ' : ''}`}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={form.isSaving}
              className={`${primaryButtonClass} shrink-0`}
            >
              <Plus size={13} className="inline mr-1" aria-hidden="true" /> {t('form.add')}
            </button>
          </div>
        </td>
      </tr>
      {/* Reserved status row: always present at a fixed height so an
          error can never shift the table - no absolutely-positioned
          overlay fighting the collapsed borders and the sticky header.
          The alert region stays mounted empty: a region that exists
          before its text arrives announces reliably. The cell spans the
          full possible column count - a span wider than the currently
          rendered set is valid HTML and renders fine at each width. */}
      <tr className="h-5">
        <td colSpan={5} className="h-5 px-3 py-0">
          <div role="alert" className="flex items-center gap-1 text-[11px] text-negative font-medium">
            {statusError && (
              <>
                <AlertCircle size={12} className="shrink-0" />
                <span>{statusError}</span>
              </>
            )}
          </div>
        </td>
      </tr>
    </>
  )
}
