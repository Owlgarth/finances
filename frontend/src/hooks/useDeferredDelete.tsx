import { useCallback, useSyncExternalStore } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { getApiBaseUrl, getAuthToken, transactionsApi, transfersApi } from '../api/client'
import { queryClient } from '../api/queryClient'
import type { Transaction, Transfer } from '../types'
import { getApiErrorMessage } from '../utils/errors'

/** How long the Undo window holds the delete request back. The delete is
 *  only DELAYED client-side - once the request is sent it is unrecoverable,
 *  so every path that sends it must also dismiss the Undo toast (a dead
 *  Undo button must never outlive the pending item). */
const UNDO_WINDOW_MS = 5000

export interface DeferredDeleteConfig<T extends { id: number }> {
  /** Sends the real DELETE (axios). */
  commit: (item: T) => Promise<unknown>
  /** Query keys invalidated once the commit succeeds. */
  invalidationKeys: string[][]
  /** Toast copy: title, Undo label, restore-on-reject fallback. */
  messages: { deleted: string; undo: string; rejected: string }
  /** Path appended to getApiBaseUrl() for the pagehide keepalive flush. */
  keepalivePath: (item: T) => string
}

interface PendingEntry<T extends { id: number }> {
  item: T
  timer: ReturnType<typeof setTimeout>
  toastId: string
  config: DeferredDeleteConfig<T>
}

/** The store's externally visible surface (the hook's subscription seam). */
interface DeferredDeleteStore<T extends { id: number }> {
  subscribe: (listener: () => void) => () => void
  getPendingId: () => number | null
  request: (item: T, config: DeferredDeleteConfig<T>) => void
}

/** One pending slot per entity family, at module scope: the window must
 *  survive route changes (the record pages arm it and navigate back to the
 *  list at once; the list pages read pendingId to keep the row hidden -
 *  a useState-in-component slot would die with the record page's unmount).
 *  A second request flushes the first, so a single slot - never a set. */
function createDeferredDeleteStore<T extends { id: number }>(): DeferredDeleteStore<T> {
  let pending: PendingEntry<T> | null = null
  let flushedKeys: string[][] | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach((l) => l())
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => { listeners.delete(l) }
  }
  const getPendingId = (): number | null => pending?.item.id ?? null

  const clearPending = () => {
    if (!pending) return
    clearTimeout(pending.timer)
    pending = null
    notify()
  }

  /** Commit now: timer expiry, a second request, or a page-teardown flush.
   *  The row is restored reactively the moment pending clears - on
   *  rejection that IS the restore, so the error toast is the only extra
   *  work. */
  const commitNow = async () => {
    const entry = pending
    if (!entry) return
    clearPending()
    toast.dismiss(entry.toastId)
    try {
      await entry.config.commit(entry.item)
      entry.config.invalidationKeys.forEach((key) =>
        queryClient.invalidateQueries({ queryKey: key }))
    } catch (error) {
      toast.error(getApiErrorMessage(error, entry.config.messages.rejected))
    }
  }

  /** Undo restores: no request was sent, so clearing the slot is the whole
   *  action - hosts reading pendingId re-show the row. */
  const undo = () => {
    if (!pending) return
    toast.dismiss(pending.toastId)
    clearPending()
  }

  const request = (item: T, config: DeferredDeleteConfig<T>) => {
    if (pending) void commitNow() // a second delete flushes the first
    const toastId = toast.success(
      <span className="flex items-center">
        <span>{config.messages.deleted}</span>
        {/* Part of the message ReactNode, not a custom toast component:
            this library has no action option - the default toast skin,
            position, and the app-level Toaster all stay. */}
        <button
          type="button"
          onClick={undo}
          className="ml-3 shrink-0 rounded-sm text-[13px] font-semibold text-primary hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus touch-hit"
        >
          {config.messages.undo}
        </button>
      </span>,
      { duration: UNDO_WINDOW_MS },
    )
    const timer = setTimeout(() => void commitNow(), UNDO_WINDOW_MS)
    pending = { item, timer, toastId, config }
    notify()
  }

  /** Page teardown flush. axios cannot outlive the page, so this is a
   *  keepalive fetch. The token is read AT flush time (a stale closure
   *  over a null token silently drops the delete). Best effort: on
   *  return-from-hidden the flushed keys are invalidated so the visible
   *  state converges (list hooks also refetch on focus). */
  const flushForPageHide = () => {
    const entry = pending
    if (!entry) return
    clearPending()
    toast.dismiss(entry.toastId)
    flushedKeys = entry.config.invalidationKeys
    const token = getAuthToken()
    if (!token) return
    void fetch(`${getApiBaseUrl()}${entry.config.keepalivePath(entry.item)}`, {
      method: 'DELETE',
      keepalive: true,
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => { /* teardown is best effort */ })
  }

  // Registered once per store, at module scope - never per mount, so
  // StrictMode's simulated unmount can never double-fire them, and no
  // unmount cleanup exists anywhere in this module. pagehide covers tab
  // close; visibilitychange->hidden covers mobile Safari app-switch,
  // where pagehide alone is unreliable.
  window.addEventListener('pagehide', flushForPageHide)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushForPageHide()
    } else if (flushedKeys) {
      flushedKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }))
      flushedKeys = null
    }
  })

  return { subscribe, getPendingId, request }
}

const transactionStore = createDeferredDeleteStore<Transaction>()
const transferStore = createDeferredDeleteStore<Transfer>()

/** Deferred delete for one entity family. `pendingId` is reactive: hosts
 *  filter it out of the rendered list and thread it into totals strips;
 *  Undo / a rejected commit null it and the row returns on its own. */
function useDeferredDelete<T extends { id: number }>(
  store: DeferredDeleteStore<T>,
  config: DeferredDeleteConfig<T>,
) {
  const pendingId = useSyncExternalStore(store.subscribe, store.getPendingId)
  // The config object is rebuilt every render (it carries t() strings), so
  // request's identity changes with it - fine: request is only ever called
  // from event handlers, never an effect or a dep.
  const request = useCallback((item: T) => store.request(item, config), [store, config])
  return { request, pendingId }
}

/** Transactions. The full invalidation set: deleting changes the account
 *  balance exactly as editing does, so all three keys (list family,
 *  current balances, per-account balance) refetch on commit. */
export function useTransactionDeferredDelete() {
  const { t } = useTranslation('transactions')
  return useDeferredDelete(transactionStore, {
    commit: (tx) => transactionsApi.delete(tx.id),
    invalidationKeys: [['transactions'], ['current-balances'], ['account-balance']],
    messages: { deleted: t('deleted'), undo: t('undo'), rejected: t('deleteRejected') },
    keepalivePath: (tx) => `/transactions/${tx.id}`,
  })
}

/** Transfers: the same three-key set (both balance ends move on delete). */
export function useTransferDeferredDelete() {
  const { t } = useTranslation('transfers')
  return useDeferredDelete(transferStore, {
    commit: (tr) => transfersApi.delete(tr.id),
    invalidationKeys: [['transfers'], ['current-balances'], ['account-balance']],
    messages: { deleted: t('toast.deleted'), undo: t('toast.undo'), rejected: t('toast.deleteRejected') },
    keepalivePath: (tr) => `/transfers/${tr.id}`,
  })
}
