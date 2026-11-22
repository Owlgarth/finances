// /new draft persistence: unsaved scalar form values are kept in
// localStorage so an accidental reload or navigation does not lose a
// half-typed transaction or transfer. The storage key is scoped to the
// signed-in user AND the workspace, following the app's `owlgarth_*`
// localStorage key convention (api/client.ts tokens, ThemeContext,
// LanguageContext, WorkspaceContext's selected-account key).
//
// Contract:
// - WRITES happen only from user-action change handlers, debounced 500ms
//   (createFormDraftController.update) or flushed on /new unmount. No effect
//   reads React state to write a draft - the controller closure holds the
//   latest sparse values (React refs are not used: render-time ref writes
//   are lint-forbidden in this repo).
// - RESTORE happens once per storage key (the /new page reads the draft in
//   a useMemo before the form hooks seed) and only when the draft is
//   younger than 24 hours (writtenAt; expired drafts are pruned on read).
// - The receipt File, parse state, and line-item rows are NEVER drafted -
//   receipt-derived data is not scalar user input and does not survive a
//   reload anyway. Values not drafted stay absent from the sparse values
//   object so restores fall back to the plain-create derivation.
// - removeFormDraft / removeDraftsForUser bump a generation counter: a
//   controller flushed after a logout or workspace-switch clear (the page's
//   unmount cleanup) aborts its write instead of resurrecting the draft.

import type { TransactionType } from '../types'

/** Sparse snapshot of the /new form's user-editable scalar values. Absent
 *  field = the user never changed it this session (the plain-create
 *  derivation re-runs on restore); present null = an explicit "no pick"
 *  (e.g. No account). Only fields the user actually typed/picked appear. */
export interface NewFormDraftValues {
  /** Page segment value ('transfer' picks the transfer flavor). */
  type?: 'expense' | 'income' | 'transfer'
  /** Shared amount row (transaction amount / transfer sent amount). */
  amount?: string
  /** Shared date row (YYYY-MM-DD). */
  date?: string
  /** The transaction hook's own type (also holds 'adjustment', which the
   *  More-details switch owns - it stays drafted with the rest). */
  txType?: TransactionType
  description?: string
  note?: string
  /** null = explicit "No account". */
  accountId?: number | null
  currencyCode?: string | null
  budgetId?: number | null
  categoryId?: number | null
  otherCurrency?: boolean
  originalAmount?: string
  originalCurrencyCode?: string | null
  originalAccountId?: number | null
  transferFromId?: number | null
  transferToId?: number | null
  transferToAmount?: string
  transferDescription?: string
}

/** Stored shape: values plus the write timestamp the 24h gate reads. */
export interface StoredFormDraft {
  writtenAt: number
  values: NewFormDraftValues
}

const KEY_PREFIX = 'owlgarth_formdraft_'
const MAX_AGE_MS = 24 * 60 * 60 * 1000
const WRITE_DEBOUNCE_MS = 500

// Bumped by every removal (removeFormDraft / removeDraftsForUser);
// controllers capture the current value and abort writes once it moves on.
let generation = 0

export function formDraftKey(userId: number, workspaceId: number): string {
  return `${KEY_PREFIX}${userId}_${workspaceId}`
}

/** Read the stored draft. Null when absent, unparseable, empty, or older
 *  than 24 hours (expired and malformed entries are pruned). A pure read -
 *  safe from any render. */
export function readFormDraft(key: string): StoredFormDraft | null {
  let stored: string | null
  try {
    stored = localStorage.getItem(key)
  } catch {
    return null
  }
  if (stored === null) return null
  try {
    const parsed = JSON.parse(stored) as StoredFormDraft
    const shapeOk =
      typeof parsed?.writtenAt === 'number' &&
      typeof parsed?.values === 'object' &&
      parsed.values !== null &&
      Object.keys(parsed.values).length > 0
    if (!shapeOk || Date.now() - parsed.writtenAt > MAX_AGE_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

function writeFormDraft(key: string, values: NewFormDraftValues): void {
  try {
    localStorage.setItem(key, JSON.stringify({ writtenAt: Date.now(), values }))
  } catch {
    // Quota / private-mode failures drop the draft silently - persistence
    // is best-effort convenience, never a gate.
  }
}

/** Workspace switch (successful): remove the old (user, workspace) draft. */
export function removeFormDraft(userId: number, workspaceId: number): void {
  generation += 1
  try {
    localStorage.removeItem(formDraftKey(userId, workspaceId))
  } catch {
    // ignore
  }
}

/** Logout: every draft key belonging to the user, any workspace. */
export function removeDraftsForUser(userId: number): void {
  generation += 1
  const prefix = `${KEY_PREFIX}${userId}_`
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i)
      if (k !== null && k.startsWith(prefix)) doomed.push(k)
    }
    for (const k of doomed) localStorage.removeItem(k)
  } catch {
    // ignore
  }
}

export interface FormDraftController {
  /** Merge a sparse patch into the latest values and (re)start the debounced
   *  write. Call from user-action change handlers only - never from
   *  seeding, parse callbacks, or resets (those must not draft). */
  update: (patch: Partial<NewFormDraftValues>) => void
  /** Write immediately when edits are pending (the page's unmount flush).
   *  Aborts after any removal bumped the generation. A visit with no edits
   *  never rewrites (and so never refreshes writtenAt). */
  flush: () => void
  /** Drop the draft: cancel the pending write, forget the latest values,
   *  remove the key (save success, notice Discard, leave-discard). Later
   *  update calls start a fresh draft from scratch. */
  clear: () => void
}

/** One controller per /new mount and storage key. `baseline` seeds the
 *  in-memory latest values from the restored draft so a single later edit
 *  flushes the FULL restored state, not just the edited field. */
export function createFormDraftController(
  key: string,
  baseline: NewFormDraftValues | null,
): FormDraftController {
  const gen = generation
  let latest: NewFormDraftValues | null = baseline !== null ? { ...baseline } : null
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  const writeNow = () => {
    timer = null
    if (gen !== generation) return // a removal invalidated this controller
    if (latest === null || !dirty) return
    dirty = false
    writeFormDraft(key, latest)
  }
  return {
    update(patch) {
      latest = { ...(latest ?? {}), ...patch }
      dirty = true
      cancel()
      timer = setTimeout(writeNow, WRITE_DEBOUNCE_MS)
    },
    flush() {
      cancel()
      writeNow()
    },
    clear() {
      cancel()
      latest = null
      dirty = false
      try {
        localStorage.removeItem(key)
      } catch {
        // ignore
      }
    },
  }
}
