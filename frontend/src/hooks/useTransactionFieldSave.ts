import { useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionsApi, type TransactionInput } from '../api/client'
import type { Transaction } from '../types'
import { useAccounts } from './useDomain'

/** A one-field patch: any subset of TransactionInput except items. Items
 * belong to transactionsApi.replaceItems - the update endpoint leaves the
 * stored rows untouched when the key is absent, and a field save must never
 * resize or replace them. The Omit enforces that at compile time. */
export type TransactionFieldPatch = Omit<Partial<TransactionInput>, 'items'>

/**
 * One-field saves for the transaction record. `update` is a full-replace
 * PUT, so each save re-sends the COMPLETE TransactionInput: every field
 * forwarded unchanged from the loaded transaction with the patch applied
 * on top - a one-field edit can therefore never clear another field.
 * `note` and the original_* facet keys are always sent, even as null,
 * mirroring the transaction form's edit payload (an absent key would clear
 * the note / delete the linked adjustment).
 *
 * Editors own value normalization before calling `save` (description/note
 * trimmed, an emptied note sent as null, amounts dot-decimal): the hook
 * forwards patch values verbatim.
 *
 * `save` rejects on failure: the editor owns error display (EditableField
 * shows the server message under the row and restores the previous value),
 * so this hook never toasts. `isSaving` spans the PUT through its
 * invalidation dispatch; callers should keep other editors closed while it
 * is true - two overlapping saves built from the same base row make the
 * second full PUT silently revert the first field.
 */
export function useTransactionFieldSave(transaction: Transaction): {
  save: (patch: TransactionFieldPatch) => Promise<Transaction>
  isSaving: boolean
} {
  const queryClient = useQueryClient()
  // Active accounts resolve the coupled account -> currency rule (the
  // record's account picker offers no archived accounts either).
  const { data: accounts = [] } = useAccounts(false)

  const mutation = useMutation({
    mutationFn: (patch: TransactionFieldPatch) => {
      const payload: TransactionInput = {
        date: transaction.date,
        description: transaction.description,
        // Always sent, even as null: update is full-replace - an absent
        // key would silently clear a stored note.
        note: transaction.note,
        type: transaction.type,
        amount: transaction.amount,
        account_id: transaction.account_id,
        currency_code: transaction.currency_code,
        // Adjustments carry no category (the form's rule): forwarding a
        // stored category on an adjustment row would 400 on save.
        category_id: transaction.type === 'adjustment' ? null : transaction.category_id,
        // Always sent, even as null: null = the informational-only facet
        // and deletes any linked adjustment; omitting the keys on a
        // facet-bearing row would do the same silently.
        original_amount: transaction.original_amount,
        original_currency_code: transaction.original_currency_code,
        original_account_id: transaction.original_account_id,
        ...patch,
      }
      // Coupled rule: this hook owns account -> currency. Switching the
      // account moves the row onto that account's currency, unless the
      // caller sent a currency of its own. The server derives the
      // currency from the account anyway - this keeps the sent pair
      // consistent, like the transaction form does client-side. An
      // account-less retarget (account_id: null) keeps the row's own
      // currency: for account-less rows currency_code IS the stored
      // truth. Unknown account id (not in the active list): keep the
      // row's currency and let the server resolve.
      if (patch.account_id != null && patch.currency_code === undefined) {
        const account = accounts.find((a) => a.id === patch.account_id)
        if (account) payload.currency_code = account.currency_code
      }
      return transactionsApi.update(transaction.id, payload)
    },
    onSuccess: () => {
      // The same three invalidations the transaction form's save mutation
      // issues. The ['transactions'] prefix also refetches this record's
      // own ['transactions', 'detail', id] entry (TanStack prefix match),
      // which is what re-renders the record with the saved row.
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
    },
  })

  return {
    save: (patch: TransactionFieldPatch) => mutation.mutateAsync(patch),
    isSaving: mutation.isPending,
  }
}
