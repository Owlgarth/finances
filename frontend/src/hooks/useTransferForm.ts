import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { transfersApi } from '../api/client'
import type { Account, Transfer } from '../types'
import { useAccounts } from './useDomain'
import { getApiErrorMessage } from '../utils/errors'
import { normalizeAmountInput, parseAmountNumber } from '../utils/amountInput'
import { type FormDraftController, type NewFormDraftValues } from '../utils/formDraft'

const LAST_PAIR_KEY = 'owlgarth-last-transfer-pair'

/** Field-keyed validation errors. Display-only: they never gate submit -
 *  the toast chain inside submit() is the gate, exactly like the modal's
 *  original early-return chain. Key insertion order mirrors that chain
 *  (accounts, sent amount, received amount) so the first entry is also
 *  the message the chain would have toasted. */
export interface TransferFormErrors {
  from?: string
  to?: string
  fromAmount?: string
  toAmount?: string
}

/** Controlled-override seam for a host that lifts the amount/date rows
 *  above the form (the /new shared rows). Internal state stays
 *  authoritative when no override is passed - the modal passes nothing.
 *  Explicit values win downward; internal writes (seeding) report upward
 *  synchronously, so the lifted value and internal state never diverge. */
export interface TransferFormShared {
  amount: string
  onAmountChange: (value: string) => void
  date: string
  onDateChange: (value: string) => void
}

interface Options {
  open: boolean
  /** Edit an existing transfer: every field prefilled, saved via update. */
  editFrom?: Transfer | null
  /** Prefill from a "Repeat" action on a history row (amounts/date cleared). */
  repeatFrom?: Transfer | null
  /** Fire the validation toasts on a failed submit (the modal keeps them;
   *  /new renders field errors instead and passes false). Default true. */
  validationToasts?: boolean
  shared?: TransferFormShared
  /** /new draft persistence. When provided, the user-action setters write
   *  through the debounced controller, and `values` (the draft restored
   *  at mount; null when none/expired) seeds the create-mode
   *  pair/amounts/description ahead of the plain-create derivation.
   *  Undefined (the default) keeps every other host draft-free. */
  draft?: {
    controller: FormDraftController
    values: NewFormDraftValues | null
  } | null
  /** Bump to force a fresh create-mode re-seed without a remount (the /new
   *  draft notice's Discard). Default 0 = never re-seeds. */
  reseedNonce?: number
}

function accountById(accounts: Account[], id: number | null): Account | undefined {
  return accounts.find((a) => a.id === id)
}

/** Default from/to pair for a fresh create session: the last-used pair
 * (when both ends still exist), else auto-fill when exactly two accounts. */
function deriveDefaultPair(accounts: Account[]): { from: number | null; to: number | null } {
  let from: number | null = null
  let to: number | null = null
  const stored = localStorage.getItem(LAST_PAIR_KEY)
  if (stored) {
    const [f, t] = stored.split(',').map(Number)
    if (accounts.some((a) => a.id === f)) from = f
    if (accounts.some((a) => a.id === t)) to = t
  }
  if (from === null && to === null && accounts.length === 2) {
    from = accounts[0].id
    to = accounts[1].id
  }
  return { from, to }
}

/**
 * Form state machine for recording, editing, or repeating a transfer,
 * split from its original host so pages and panels can host the same
 * form inline (the /new page's transfer flavor). Owns the
 * pair/amount/date/description
 * state and its session seeding render-adjust (edit/repeat prefills, the
 * last-used-pair default, the two-account auto-fill), the cross-currency
 * derivations, validation, and the save mutation. The HOST owns all DOM
 * and closes after submit() resolves ok - the modal keeps its validation
 * toasts, /new passes validationToasts: false and renders field errors.
 */
export function useTransferForm({
  open,
  editFrom = null,
  repeatFrom = null,
  validationToasts = true,
  shared,
  draft = null,
  reseedNonce = 0,
}: Options) {
  const { t } = useTranslation('transfers')
  const { t: tCommon } = useTranslation('common')
  const queryClient = useQueryClient()

  const { data: accounts = [] } = useAccounts(false)

  const [fromId, setFromId] = useState<number | null>(null)
  const [toId, setToId] = useState<number | null>(null)
  const [fromAmount, setFromAmountState] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [date, setDateState] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')

  // Session tracker for the render-adjust below: the open flip, or a
  // mid-open edit/repeat source swap, starts a new seeding session. The
  // sentinel initializer (closed, no mode, no source) can never match a
  // real session, so the first render of the mount-per-use edit modal
  // still counts as a boundary and seeds. accounts.length is deliberately
  // NOT a session input - a refetch that changes the list must never
  // re-seed typed edits. Late-arriving accounts get their own guarded
  // adjust below.
  const [session, setSession] = useState<{
    open: boolean
    mode: 'edit' | 'repeat' | 'create' | 'none'
    source: Transfer | null
    reseedNonce: number
  }>({ open: false, mode: 'none', source: null, reseedNonce: 0 })
  // Length of the accounts list the default-branch pair seeding last saw.
  const [seededAccountsLen, setSeededAccountsLen] = useState(accounts.length)

  // Merged setters: internal writes report upward through the override so
  // the lifted value never goes stale (create seeding, reset). Without an
  // override they are plain passthroughs - modal behavior is unchanged.
  const setFromAmount = (value: string) => {
    setFromAmountState(value)
    shared?.onAmountChange(value)
  }
  const setDate = (value: string) => {
    setDateState(value)
    shared?.onDateChange(value)
  }
  // Downward half: the host's explicit value wins. Value-compare
  // render-adjust on this hook's own state - loop-safe by construction
  // (each write lands on a value that disproves the guard on the
  // immediate re-render) and StrictMode-idempotent.
  if (shared !== undefined && shared.amount !== fromAmount) setFromAmount(shared.amount)
  if (shared !== undefined && shared.date !== date) setDate(shared.date)

  // Prefill render-adjust: edit > repeat > last-used pair > auto-fill when
  // exactly two accounts. A session boundary seeds every field; React
  // discards this render pass and re-runs the component with the seeded
  // state before anything commits. Seeding runs during render, so this
  // same pass must not consume the values it just queued.

  const mode = editFrom ? 'edit' : repeatFrom ? 'repeat' : 'create'
  const source = editFrom ?? repeatFrom ?? null
  const seeding =
    open !== session.open ||
    session.mode !== mode ||
    session.source !== source ||
    reseedNonce !== session.reseedNonce
  if (seeding) setSession({ open, mode, source, reseedNonce })
  if (seeding && open) {
    if (editFrom) {
      setFromId(editFrom.from_account_id)
      setToId(editFrom.to_account_id)
      setFromAmount(editFrom.from_amount)
      setToAmount(editFrom.to_amount)
      setDate(editFrom.date)
      setDescription(editFrom.description)
    } else if (repeatFrom) {
      setFromId(repeatFrom.from_account_id)
      setToId(repeatFrom.to_account_id)
      setDescription(repeatFrom.description)
      setFromAmount('')
      setToAmount('')
      setDate(new Date().toISOString().slice(0, 10))
    } else {
      const dv = draft?.values ?? null
      const pair = deriveDefaultPair(accounts)
      // Draft picks win over the derived default pair (null = explicit no
      // pick); amounts/description/date come from the shared draft fields.
      setFromId(dv?.transferFromId !== undefined ? dv.transferFromId : pair.from)
      setToId(dv?.transferToId !== undefined ? dv.transferToId : pair.to)
      setFromAmount(dv?.amount !== undefined ? dv.amount : '')
      setToAmount(dv?.transferToAmount ?? '')
      setDescription(dv?.transferDescription ?? '')
      setDate(dv?.date !== undefined ? dv.date : new Date().toISOString().slice(0, 10))
    }
  }

  // Default-branch arrival adjust: when the accounts list length changes
  // (first resolution, or a genuinely different list), re-derive the
  // last-used pair / two-account auto-fill - but only for a create-mode
  // session whose pair fields are still untouched, so a mid-edit refetch
  // never clobbers a typed transfer.
  if (accounts.length !== seededAccountsLen) {
    setSeededAccountsLen(accounts.length)
    if (open && !editFrom && !repeatFrom) {
      const dv = draft?.values ?? null
      // A draft carrying a pair choice made it EXPLICITLY (either end null
      // = deliberate no pick): suppress the auto-fill, or every cold mount
      // would re-derive over the draft's pair.
      const explicitPair = dv !== null && ('transferFromId' in dv || 'transferToId' in dv)
      if (fromId === null && toId === null && !explicitPair) {
        const pair = deriveDefaultPair(accounts)
        setFromId(pair.from)
        setToId(pair.to)
      } else if (dv !== null) {
        // Draft-restored ids that no longer exist restore as absent
        // (dropped to null, never re-derived).
        if (fromId !== null && !accounts.some((a) => a.id === fromId)) setFromId(null)
        if (toId !== null && !accounts.some((a) => a.id === toId)) setToId(null)
      }
    }
  }

  const fromAccount = accountById(accounts, fromId)
  const toAccount = accountById(accounts, toId)
  const crossCurrency = !!fromAccount && !!toAccount && fromAccount.currency_code !== toAccount.currency_code

  const fromNum = parseAmountNumber(fromAmount)
  const toNum = parseAmountNumber(toAmount)
  const impliedRate =
    crossCurrency && fromNum !== null && toNum !== null && fromNum > 0 ? (toNum / fromNum).toFixed(6) : null

  // Seed snapshot for isDirty: captured on the kept render after every
  // seeding boundary (values then equal what the seeding pass wrote).
  // Any later difference from the snapshot is user work worth confirming
  // against. Loop-safe: the compare disproves itself on the re-render.
  const [seedSession, setSeedSession] = useState<typeof session | null>(null)
  const [seedSnapshot, setSeedSnapshot] = useState<{
    fromId: number | null
    toId: number | null
    fromAmount: string
    toAmount: string
    date: string
    description: string
  } | null>(null)
  if (open && seedSession !== session) {
    setSeedSession(session)
    setSeedSnapshot({ fromId, toId, fromAmount, toAmount, date, description })
  }
  const isDirty =
    seedSnapshot !== null &&
    (fromId !== seedSnapshot.fromId ||
      toId !== seedSnapshot.toId ||
      fromAmount !== seedSnapshot.fromAmount ||
      toAmount !== seedSnapshot.toAmount ||
      date !== seedSnapshot.date ||
      description !== seedSnapshot.description)

  const errors: TransferFormErrors = {}
  if (!fromId) errors.from = t('validation.chooseBoth')
  if (!toId) errors.to = t('validation.chooseBoth')
  else if (fromId === toId) errors.to = t('validation.accountsDiffer')
  if (!fromAmount) errors.fromAmount = t('validation.enterAmount')
  else {
    const normFrom = normalizeAmountInput(fromAmount)
    if (normFrom === null) errors.fromAmount = tCommon('validation.amountInvalid')
    else if (Number(normFrom) <= 0) errors.fromAmount = t('validation.enterAmount')
  }
  // The received amount only exists on a cross-currency transfer; same
  // empty / unparseable / positive trio under its own message keys.
  if (crossCurrency) {
    if (!toAmount) errors.toAmount = t('validation.enterReceived')
    else {
      const normTo = normalizeAmountInput(toAmount)
      if (normTo === null) errors.toAmount = tCommon('validation.amountInvalid')
      else if (Number(normTo) <= 0) errors.toAmount = t('validation.enterReceived')
    }
  }
  const firstError = Object.values(errors)[0] ?? null

  const mutation = useMutation({
    mutationFn: (amounts: { fromAmount: string; toAmount: string | null }) => {
      const payload = {
        from_account_id: fromId!,
        to_account_id: toId!,
        from_amount: amounts.fromAmount,
        to_amount: crossCurrency ? amounts.toAmount : null,
        date,
        description: description.trim(),
      }
      return editFrom ? transfersApi.update(editFrom.id, payload) : transfersApi.create(payload)
    },
    onSuccess: () => {
      // Only a newly recorded pair is "the last transfer made" - editing an
      // old one must not capture its pair as the next default.
      if (!editFrom) localStorage.setItem(LAST_PAIR_KEY, `${fromId},${toId}`)
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      toast.success(editFrom ? t('toast.updated') : t('toast.recorded'))
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, editFrom ? t('toast.updateFailed') : t('toast.recordFailed'))),
  })

  /** Runs the validation gates and the save - the checks are the modal's
   *  old early-return chain, same order and same messages; the field-keyed
   *  errors above are display-only and never gate. Resolves after the
   *  mutation's invalidations and toasts have run; hosts await this and
   *  close on ok. */
  const submit = async (): Promise<{ ok: boolean }> => {
    if (firstError !== null) {
      if (validationToasts) toast.error(firstError)
      return { ok: false }
    }
    const normFrom = normalizeAmountInput(fromAmount)
    const normTo = crossCurrency ? normalizeAmountInput(toAmount) : null
    if (normFrom === null || (crossCurrency && normTo === null)) {
      // Unreachable while the derived errors above exist; kept as a typed
      // guard so the payload never sees an unparseable string.
      if (validationToasts) toast.error(tCommon('validation.amountInvalid'))
      return { ok: false }
    }
    try {
      await mutation.mutateAsync({ fromAmount: normFrom, toAmount: normTo })
      return { ok: true }
    } catch {
      // The mutation's onError already toasted the API failure; the host
      // only needs the result.
      return { ok: false }
    }
  }

  /** Reset for "Save and add another": clears amounts/description and
   *  re-derives the default pair (the just-saved pair is now the
   *  last-used one), keeps the date (the shared row owns it on /new).
   *  Re-arms the isDirty snapshot via the session latch. */
  const resetForAnother = () => {
    const pair = deriveDefaultPair(accounts)
    setFromId(pair.from)
    setToId(pair.to)
    setFromAmount('')
    setToAmount('')
    setDescription('')
    setSeedSession(null)
  }

  // ---- Draft writes: returned setters are the user-action seams; seeding
  // and resetForAnother keep the raw setters (see the transaction hook's
  // twin block). The merged setFromAmount/setDate stay unwrapped - the /new
  // page owns the draft writes for the lifted amount/date rows. ----
  const draftUpdate = (patch: Partial<NewFormDraftValues>) => {
    draft?.controller.update(patch)
  }
  const changeFromId = (v: number | null) => {
    setFromId(v)
    draftUpdate({ transferFromId: v })
  }
  const changeToId = (v: number | null) => {
    setToId(v)
    draftUpdate({ transferToId: v })
  }
  const changeToAmount = (v: string) => {
    setToAmount(v)
    draftUpdate({ transferToAmount: v })
  }
  const changeDescription = (v: string) => {
    setDescription(v)
    draftUpdate({ transferDescription: v })
  }

  // Stable discriminator for the current seeding session (mirrors
  // useTransactionForm.sessionKey): the /new page keys its fields component
  // on it so a draft-Discard re-seed remounts the fields (local touched
  // flags and disclosure latches reset). The nonce suffix appears only
  // after an explicit re-seed request, so other hosts' keys are unchanged.
  const sessionKey = `${session.open ? 'o' : 'c'}-${session.mode}-${session.source?.id ?? 'new'}${
    session.reseedNonce > 0 ? `-${session.reseedNonce}` : ''
  }`

  return {
    accounts,
    fromId,
    toId,
    fromAmount,
    toAmount,
    date,
    description,
    setFromId: changeFromId,
    setToId: changeToId,
    setFromAmount,
    setToAmount: changeToAmount,
    setDate,
    setDescription: changeDescription,
    fromAccount,
    toAccount,
    crossCurrency,
    impliedRate,
    errors,
    submit,
    isSaving: mutation.isPending,
    isDirty,
    resetForAnother,
    sessionKey,
  }
}

export type UseTransferFormReturn = ReturnType<typeof useTransferForm>
