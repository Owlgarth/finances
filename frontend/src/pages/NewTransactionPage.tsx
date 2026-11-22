import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CloudOff, Loader2, ScanLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { transactionsApi, transfersApi } from '../api/client'
import type { Transaction } from '../types'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { usePermissions } from '../hooks/usePermissions'
import { useExtractionConfig } from '../hooks/useDomain'
import { useIsTouch } from '../hooks/useBreakpoint'
import { useTransactionForm } from '../hooks/useTransactionForm'
import { useTransferForm } from '../hooks/useTransferForm'
import { intParam } from '../utils/params'
import { formatAmount } from '../utils/format'
import FormPage from '../components/layout/FormPage'
import TransactionFormFields from '../components/transactions/TransactionFormFields'
import TransferFormFields from '../components/transactions/TransferFormFields'
import AmountField from '../components/transactions/AmountField'
import SegmentedControl from '../components/common/SegmentedControl'
import DateQuickPick from '../components/common/DateQuickPick'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

// File types the receipt parser accepts - keep in sync with the
// byte-identical copy in components/transactions/TransactionFormFields.tsx
// (two consumers; extract a shared constant at the third).
const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf'

// Which footer action is in flight (drives the clicked button's spinner;
// both buttons disable on it, closing the click-to-mutation-start gap).
type SaveAction = 'save' | 'another' | null

/** The page's type segments. The transaction hook's own type state also
 *  holds 'adjustment' (the More-details switch owns it and disables the
 *  segments); 'transfer' is page-only - it swaps the hosted field
 *  component, so it never maps onto the hook's type. */
type NewRecordType = 'expense' | 'income' | 'transfer'

/** Create-only host for the transaction AND transfer forms: URL-seeded
 *  (?type=, ?account=, ?copy=) create mode inside a FormPage, with the
 *  type/amount/date rows shared above both field flavors (switching type
 *  keeps amount and date), the sticky two-action footer, and an
 *  unsaved-changes confirm on close. Edit stays in the modals. */
export default function NewTransactionPage() {
  const { t } = useTranslation('transactions')
  const { t: tTransfers } = useTranslation('transfers')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { workspace, isLoading: workspaceLoading } = useWorkspace()
  const { canWrite } = usePermissions()
  const { enabled: extractionEnabled, reachable: extractionReachable } = useExtractionConfig()
  const isTouch = useIsTouch()

  // URL-state contract: the seeds are read ONCE at mount (lazy
  // initializers); nothing on this page ever writes the URL, and the type
  // param is never re-written when the user switches segments. Param-only
  // navigation cannot re-run initializers anyway, but the lazy form keeps
  // that a property of construction rather than of router internals.
  const typeParam = searchParams.get('type')
  const [initialAccountId] = useState(() => intParam(searchParams, 'account'))
  const [sharedType, setSharedType] = useState<NewRecordType>(() =>
    // 'income' and 'transfer' seed their segment; every other value reads
    // as expense.
    typeParam === 'income' || typeParam === 'transfer' ? typeParam : 'expense',
  )
  const [copyId] = useState(() => intParam(searchParams, 'copy'))
  const isTransfer = sharedType === 'transfer'

  // Copy-mode source. Keyed INSIDE the ['transactions'] family prefix so the
  // family's existing invalidation calls (create/edit/delete in the form hook
  // and the list pages) refetch it, like TransfersPage's edit-prefill query.
  const copyQuery = useQuery({
    queryKey: ['transactions', 'detail', copyId],
    queryFn: () => transactionsApi.get(copyId!),
    enabled: copyId !== null,
  })
  // Terminal error counts as known: a failed copy fetch degrades to plain
  // create mode (silent, like an optional-enhancement query - the URL keeps
  // ?copy= and the user can retry by reloading).
  const copyKnown = copyId === null || copyQuery.isSuccess || copyQuery.isError
  const copySource = copyQuery.data ?? null

  // Transfer repeat seed, transfer flavor (the record page's Repeat
  // action navigates here with ?copy_transfer=). Keyed INSIDE the
  // ['transfers'] family prefix - the same entry the transfer record page
  // and the list's edit prefill read - so the family's existing
  // invalidation calls refetch it. Terminal error counts as known:
  // silent degradation to plain create, the ?copy= contract.
  const [copyTransferId] = useState(() => intParam(searchParams, 'copy_transfer'))
  const copyTransferQuery = useQuery({
    queryKey: ['transfers', 'detail', copyTransferId],
    queryFn: () => transfersApi.get(copyTransferId!),
    enabled: copyTransferId !== null,
  })
  const copyTransferKnown = copyTransferId === null || copyTransferQuery.isSuccess || copyTransferQuery.isError
  const copyTransferSource = copyTransferQuery.data ?? null

  // Lifted amount/date rows, shared by both form flavors through the hooks'
  // override seam: each hook's internal state tracks the lifted values
  // continuously, so switching type keeps amount and date by construction.
  // The amount seeds from the copy source when the cache is already warm on
  // mount; the copy-seed adjust below re-asserts it after both form hooks
  // have seeded.
  const [sharedAmount, setSharedAmount] = useState(() => copySource?.amount ?? '')
  const [sharedDate, setSharedDate] = useState(new Date().toISOString().slice(0, 10))
  // Copy source object the lifted amount was last seeded from (null = none
  // yet). Deliberately NOT initialized to copySource: on a warm mount the
  // first render must still run the seeding assert below.
  const [seededCopy, setSeededCopy] = useState<Transaction | null>(null)
  const [amountTouched, setAmountTouched] = useState(false)
  // Set after a failed submit: every field error shows until the next
  // successful save-and-add-another (first-blur-then-keystroke timing
  // otherwise).
  const [showAllErrors, setShowAllErrors] = useState(false)
  const [focusTick, setFocusTick] = useState(0)
  const amountRef = useRef<HTMLInputElement | null>(null)
  const shared = {
    amount: sharedAmount,
    onAmountChange: setSharedAmount,
    date: sharedDate,
    onDateChange: setSharedDate,
  }

  const txForm = useTransactionForm({
    // The gate: machinery starts only once the copy seed has resolved, so the
    // hook seeds exactly once with the final copyFrom (no create-then-copy
    // double seed, no category query firing against a form that is about to
    // be re-seeded). With no ?copy= the flag is true on first render, which
    // IS the "hook runs with open=true" contract.
    open: copyKnown,
    copyFrom: copySource,
    validationToasts: false, // the page shows field errors inline; save toasts stay
    initialAccountId,
    // The transaction hook's type seeds from the segment; 'transfer' hides
    // this form, so its internal type stays expense until a real switch.
    initialType: isTransfer ? undefined : sharedType,
    shared,
  })
  // Same arrival gate for the transfer flavor: machinery starts only once
  // the copy_transfer seed has resolved, so the hook seeds exactly once
  // with the final repeatFrom (no create-then-repeat double seed). Without
  // the param the flag is true on first render - plain create is
  // unchanged.
  const transferForm = useTransferForm({
    open: copyTransferKnown,
    repeatFrom: copyTransferSource,
    validationToasts: false,
    shared,
  })

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [savingAction, setSavingAction] = useState<SaveAction>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ?scan=1 (an app-shortcut deep link) seeds the header scan action: focus
  // plus a static highlight ring once the button is actually usable. Read
  // once at mount like every seed param (exact value - garbage reads as
  // unset); nothing on this page writes the URL.
  const [scanSeed] = useState(() => searchParams.get('scan') === '1')
  const [scanInteracted, setScanInteracted] = useState(false)
  const scanButtonRef = useRef<HTMLButtonElement | null>(null)
  const scanFocusDoneRef = useRef(false)
  // The scan focus steal blurs the autofocused amount input on its way to
  // the header button; a programmatic blur is not a user blur and must not
  // latch the amount's error display against the pristine value.
  const scanStealRef = useRef(false)

  // The scan action is usable once the copy gates have resolved, extraction
  // is enabled and reachable, a receipt target exists (not transfer mode),
  // and no parse is in flight - the render + disabled conditions of the
  // header button.
  const scanEnabled =
    copyKnown && copyTransferKnown && extractionEnabled && !isTransfer && extractionReachable && !txForm.parse.isPending
  const scanHighlighted = scanSeed && !scanInteracted && scanEnabled

  // One-shot focus. If the button never becomes usable (transfer seeded,
  // extraction off, scanner unreachable), the amount input's autoFocus
  // stands - silent degrade, no error path. The file chooser itself always
  // waits for the user's tap (browser policy).
  useEffect(() => {
    if (!scanSeed || scanFocusDoneRef.current || !scanEnabled) return
    scanFocusDoneRef.current = true
    // Arm the one-shot blur suppression only when the amount input really
    // holds focus (touch mounts nothing autofocused, so no blur will fire).
    scanStealRef.current = document.activeElement === amountRef.current
    scanButtonRef.current?.focus()
  }, [scanSeed, scanEnabled])

  const clearScanHint = () => setScanInteracted(true)

  // Viewers (and, defense-in-depth, workspace-less mounts - MainLayout already
  // swaps children for its no-workspace message) never see this form. Held
  // through the workspace-loading window so a legitimate member is not bounced
  // by an unresolved role.
  if (!workspaceLoading && (!workspace || !canWrite)) {
    return <Navigate to="/" replace />
  }

  // Back navigation. React Router's history state carries the stack index
  // (idx); idx > 0 means an in-app entry exists to go back to. A direct load
  // or refresh of /new sits at idx 0 - falling back to the transactions list
  // keeps Back-like closes working from a deep link.
  const navigateBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/transactions', { replace: true })
  }

  const activeForm = isTransfer ? transferForm : txForm
  const dirty = txForm.isDirty || transferForm.isDirty

  const handleClose = () => {
    if (dirty) setConfirmOpen(true)
    else navigateBack()
  }

  // After a failed submit, show every error and focus the first invalid
  // field: the shared amount row is page-owned (focus it directly), the
  // rest live inside the hosted field component (bump its tick).
  const reportFailedSubmit = () => {
    setShowAllErrors(true)
    if (isTransfer) {
      if (transferForm.errors.fromAmount && !transferForm.errors.from && !transferForm.errors.to) {
        amountRef.current?.focus()
      } else if (transferForm.errors.from || transferForm.errors.to || transferForm.errors.toAmount) {
        setFocusTick((n) => n + 1)
      }
    } else if (txForm.errors.description) {
      // Description precedes amount in the chain.
      setFocusTick((n) => n + 1)
    } else if (txForm.errors.amount) {
      amountRef.current?.focus()
    } else if (Object.keys(txForm.errors).length > 0) {
      setFocusTick((n) => n + 1)
    }
  }

  const handleSave = async () => {
    setSavingAction('save')
    const { ok } = await activeForm.submit()
    setSavingAction(null)
    if (ok) navigateBack()
    else reportFailedSubmit()
  }

  const handleSaveAndAddAnother = async () => {
    setSavingAction('another')
    const { ok } = await activeForm.submit()
    setSavingAction(null)
    if (ok) {
      if (isTransfer) transferForm.resetForAnother()
      else txForm.resetForAnother()
      // Fresh form, fresh error timing: the next session's errors wait
      // for their own blur or submit.
      setShowAllErrors(false)
      setAmountTouched(false)
      // The fields stay mounted across saves, so no mount-time autofocus
      // refires - refocus the shared amount input by ref.
      amountRef.current?.focus()
    } else reportFailedSubmit()
  }

  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) txForm.parseFile(f)
    // Same-file reselect must re-fire onChange; the File is already captured
    // by parseFile, so clearing the input value is safe.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // A receipt produces a transaction, not a transfer: no scan action in
  // transfer mode.
  const scanButton = extractionEnabled && !isTransfer && (
    <button
      type="button"
      ref={scanButtonRef}
      onClick={() => {
        clearScanHint()
        fileInputRef.current?.click()
      }}
      onBlur={clearScanHint}
      onKeyDown={clearScanHint}
      disabled={txForm.parse.isPending || !extractionReachable}
      title={extractionReachable ? undefined : t('form.scannerOfflineTitle')}
      className={`${secondaryButtonClass} disabled:hover:bg-surface inline-flex items-center gap-1${scanHighlighted ? ' outline-2 outline-offset-2 outline-border-focus' : ''}`}
    >
      {txForm.parse.isPending ? (
        <>
          <Loader2 size={13} className="animate-spin" aria-hidden="true" /> {t('form.reading')}
        </>
      ) : extractionReachable ? (
        <>
          <ScanLine size={13} aria-hidden="true" /> {t('form.scanReceipt')}
        </>
      ) : (
        <>
          <CloudOff size={13} aria-hidden="true" /> {t('form.scanningOffline')}
        </>
      )}
    </button>
  )

  const savePending = savingAction !== null || activeForm.isSaving

  // Copy-seed arrival gate: hold the form (fields AND footer) until ?copy=
  // or ?copy_transfer= resolves. The page keeps no saved-defaults
  // machinery - this hold is the only gate.
  if (!copyKnown || !copyTransferKnown) {
    return (
      <FormPage title={t('newTransaction')} onClose={handleClose}>
        <div className="space-y-3 pt-2" aria-hidden="true">
          <div className="h-8 bg-surface-muted rounded-sm animate-pulse" />
          <div className="h-20 bg-surface-muted rounded-sm animate-pulse" />
        </div>
      </FormPage>
    )
  }

  // Copy-seed assert for the lifted amount. On a mount whose copy cache is
  // already warm, both form hooks seed during the same render pass: the
  // transaction hook reports the copied amount upward through the shared
  // seam, then the always-mounted transfer hook's create seeding reports ''
  // after it, and the last queued write wins - the lifted amount would start
  // empty, after which the hooks' downward adjust clobbers their own seeded
  // value. Re-asserting the copy amount here runs after both hooks, so this
  // write owns the queue. Fires once per copy source object (warm mount or
  // fetch resolution) and never again, so user edits and the reset after
  // save-and-add-another are never re-applied.
  if (seededCopy !== copySource) {
    setSeededCopy(copySource)
    setSharedAmount(copySource?.amount ?? '')
  }
  // No transfer twin of this assert, deliberately. The transaction copy
  // seed needs it because it writes a NON-empty amount into the shared
  // row while the always-mounted transfer hook's create seeding queues
  // '' after it. The transfer repeat seeding itself CLEARS amounts and
  // re-dates (both hooks queue '' and today's date - identical values,
  // order irrelevant), so there is nothing to re-assert.

  // Hoisted labels and errors (aliased-t calls must not render inline).
  const amountSentLabel = tTransfers('fields.amountSent', { code: transferForm.fromAccount?.currency_code ?? '' })
  const transferAmountLabel = tTransfers('fields.amount')
  const amountLabel = isTransfer
    ? transferForm.crossCurrency
      ? amountSentLabel
      : transferAmountLabel
    : txForm.type === 'adjustment'
      ? t('form.deltaAmountLabel')
      : t('form.amountLabel')
  const activeAmountError = isTransfer ? transferForm.errors.fromAmount : txForm.errors.amount
  const amountError =
    activeAmountError !== undefined && (amountTouched || showAllErrors) ? activeAmountError : undefined
  const currencyError = showAllErrors ? txForm.errors.currencyCode : undefined
  // The chosen suggestion's last amount as a muted text button. Fills the
  // amount ONLY on tap - never automatic. Byte-equivalent copy of the one
  // in components/transactions/TransactionFormFields.tsx (two consumers;
  // extract at the third). The transfer flavor never shows it: only the
  // transaction hook tracks suggestions.
  const lastAmount = txForm.lastAmountHint
  const txLastAmountHint =
    !isTransfer && lastAmount !== null ? (
      <button
        type="button"
        onClick={() => txForm.setAmount(lastAmount)}
        className="mt-1 inline-flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors touch-hit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus rounded-sm"
      >
        {t('form.lastAmountLabel')}{' '}
        <span className="font-mono font-medium tabular-nums">{formatAmount(lastAmount)}</span>
      </button>
    ) : undefined
  const saveLabel = isTransfer ? t('form.saveTransfer') : t('form.saveTransaction')

  return (
    <>
      <FormPage
        title={t('newTransaction')}
        onClose={handleClose}
        headerAction={scanButton}
        footer={
          // Phone (<sm): stacked full-width buttons - two side-by-side labels
          // overflow at 375px in the longer locales. Primary last = nearest
          // the thumb, still inside the sticky, keyboard-aware footer.
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleSaveAndAddAnother}
              disabled={savePending}
              className={`${secondaryButtonClass} max-sm:w-full inline-flex items-center justify-center gap-1.5`}
            >
              {savingAction === 'another' ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  {t('form.saving')}
                </>
              ) : (
                t('form.saveAndAddAnother')
              )}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={savePending}
              className={`${primaryButtonClass} max-sm:w-full inline-flex items-center justify-center gap-1.5`}
            >
              {savingAction === 'save' ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  {t('form.saving')}
                </>
              ) : (
                saveLabel
              )}
            </button>
          </div>
        }
      >
        {/* Shared rows: the type/amount/date controls sit above both form
            flavors, so switching type keeps amount and date. */}
        <div className="space-y-4">
          <div>
            <label className={labelClass}>{t('form.typeLabel')}</label>
            <SegmentedControl
              value={sharedType}
              onChange={(v) => {
                setSharedType(v)
                // The transaction hook keeps its own type state (it also
                // holds 'adjustment', which is not a page segment - the
                // More-details switch owns it). Push segment picks into
                // it in the handler.
                if (v !== 'transfer') {
                  txForm.setType(v)
                  // Suggestions are per-type: the panel stays closed
                  // until the new type's list arrives and the user
                  // interacts again.
                  txForm.setHighlighted(-1)
                  txForm.setSuggestionsOpen(false)
                }
              }}
              // Disabled while the More-details adjustment switch is on,
              // mirroring the in-form control's rule; the segment keeps
              // showing the selected expense/income value (no
              // non-matching radiogroup state).
              disabled={txForm.type === 'adjustment'}
              aria-label={t('form.typeAria')}
              options={[
                { value: 'expense', label: t('type.expense') },
                { value: 'income', label: t('type.income'), tone: 'positive' },
                { value: 'transfer', label: t('type.transfer') },
              ]}
            />
          </div>

          <AmountField
            id="new-amount"
            label={amountLabel}
            value={sharedAmount}
            onChange={setSharedAmount}
            signPrefix={isTransfer ? '' : txForm.type === 'income' ? '+' : txForm.type === 'adjustment' ? '' : '-'}
            currency={
              isTransfer
                ? undefined
                : {
                    label: t('form.currencyLabel'),
                    code: txForm.currencyCode,
                    options: txForm.currencyOptions,
                    onChange: txForm.setCurrencyCode,
                    placeholder: t('form.currencyPlaceholder'),
                    locked: txForm.accountId !== null,
                    ariaLabel: t('form.currencyAria'),
                    error: currencyError,
                  }
            }
            error={amountError}
            hint={txLastAmountHint}
            inputRef={amountRef}
            autoFocus={!isTouch}
            onBlur={() => {
              // Swallow exactly the blur the scan focus steal fires; every
              // other blur is a user blur.
              if (scanStealRef.current) {
                scanStealRef.current = false
                return
              }
              setAmountTouched(true)
            }}
          />

          <div>
            <label className={labelClass}>{t('form.dateLabel')}</label>
            <DateQuickPick value={sharedDate} onChange={setSharedDate} />
          </div>

          {/* Both field flavors stay mounted; the hidden CLASS preserves
              their state (disclosure latches, touched flags, focus)
              across type switches. */}
          <div className={isTransfer ? 'hidden' : 'space-y-4'}>
            {/* Keyed on the hook's session key per the fields component's
                host contract: a session change remounts it (local-state
                reset + fresh autofocus). On this page the session is fixed
                per mount, so the fields stay mounted across "Save and add
                another". */}
            <TransactionFormFields
              key={txForm.sessionKey}
              form={txForm}
              sharedFields
              showAllErrors={showAllErrors}
              focusInvalidTick={focusTick}
            />
          </div>
          <div className={!isTransfer ? 'hidden' : ''}>
            <TransferFormFields form={transferForm} showAllErrors={showAllErrors} focusInvalidTick={focusTick} />
          </div>
        </div>
      </FormPage>

      {/* Receipt picker for the header action - always mounted so .click()
          works inside the click gesture. The pending file itself is visible
          in the fields component's More-details receipt row. */}
      {/* No `capture` attribute: it makes mobile browsers open the camera
          directly instead of the source chooser - existing photos/files must
          stay pickable. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleReceiptFile}
        className="hidden"
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title={t('unsavedChanges.title')}
        message={t('unsavedChanges.message')}
        confirmLabel={t('unsavedChanges.discard')}
        destructive
        onConfirm={() => {
          setConfirmOpen(false)
          navigateBack()
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
