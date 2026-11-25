import { useMutation, useQueryClient } from '@tanstack/react-query'
import { plannedTransactionsApi, type PlannedInput } from '../api/client'
import type { PlannedTransaction } from '../types'
import { useAccounts } from './useDomain'

/** A one-field patch: any subset of the planned item's editable fields. The
 *  status is deliberately not patchable - every save echoes the loaded row's
 *  own status, so a field edit can never execute, skip or restore the item. */
export type PlannedFieldPatch = Partial<Omit<PlannedInput, 'status'>>

/** The fields a paid item no longer owns: its transaction is their source. */
const PAID_LOCKED_FIELDS = ['amount', 'account_id', 'currency_code', 'category_id', 'planned_date'] as const satisfies readonly (keyof PlannedFieldPatch)[]

/**
 * One-field saves for the planned item's record. `update` is a full-replace
 * PUT, so each save re-sends the complete PlannedInput: every field forwarded
 * unchanged from the loaded row with the patch applied on top, plus the row's
 * own status. The status echo is load-bearing: the schema defaults a missing
 * status to 'pending' (which the backend rejects as a revert on a paid row
 * and takes as a restore on a skipped one), and echoing any other status
 * would execute or skip the item.
 *
 * Editors own value normalization before calling `save` (name trimmed,
 * amount dot-decimal): the hook forwards patch values verbatim, except for
 * the account -> currency coupling below.
 *
 * `save` rejects on failure: the editor owns error display (EditableField
 * shows the server message under the row and restores the previous value),
 * so this hook never toasts. `isSaving` spans the PUT through its
 * invalidation dispatch; callers should keep other editors closed while it
 * is true - two overlapping saves built from the same base row make the
 * second full PUT silently revert the first field.
 *
 * A paid item (wire status 'done') accepts a name patch only. Its amount,
 * date, account, currency and category belong to the transaction its
 * payment created, and the server copies a change to them from the plan
 * row straight onto that transaction. `save` throws, before any request
 * leaves, when a patch on a paid item carries one of those fields.
 */
export function usePlannedFieldSave(planned: PlannedTransaction): {
  save: (patch: PlannedFieldPatch) => Promise<PlannedTransaction>
  isSaving: boolean
} {
  const queryClient = useQueryClient()
  // Active accounts resolve the coupled account -> currency rule.
  const { data: accounts = [] } = useAccounts(false)

  const mutation = useMutation({
    mutationFn: (patch: PlannedFieldPatch) => {
      const payload: PlannedInput = {
        name: planned.name,
        amount: planned.amount,
        account_id: planned.account_id,
        currency_code: planned.currency_code,
        category_id: planned.category_id,
        planned_date: planned.planned_date,
        status: planned.status,
        ...patch,
      }
      // Coupled rule: a picked account moves the row onto that account's
      // currency, unless the caller sent a currency of its own. "No
      // account" (account_id: null) keeps the row's currency - for an
      // account-less row the stored code IS the truth. An account id that
      // is missing from the active list keeps the row's currency and lets
      // the server resolve it.
      if (patch.account_id != null && patch.currency_code === undefined) {
        const account = accounts.find((a) => a.id === patch.account_id)
        if (account) payload.currency_code = account.currency_code
      }
      return plannedTransactionsApi.update(planned.id, payload)
    },
    onSuccess: () => {
      // The ['planned'] prefix also refetches this record's own
      // ['planned', 'detail', id] entry (TanStack prefix match), which is
      // what re-renders the record with the saved row.
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      // The server copies a paid item's save onto its transaction (the name
      // at least), so every cached view of that transaction refetches too:
      // the record's own link leads straight to one.
      if (planned.transaction_id != null) queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })

  return {
    save: (patch: PlannedFieldPatch) => {
      // A paid item's amount, date, account and category are its
      // transaction's: the server would copy a plan-row change onto that
      // transaction, overwriting what was really paid. The record saves
      // only the name on a paid item, so any other field here is a
      // programming error - refused before a request leaves.
      if (planned.status === 'done' && PAID_LOCKED_FIELDS.some((field) => field in patch)) {
        throw new Error(
          'A paid planned item saves its name only; amount, date, account, currency and category come from its transaction',
        )
      }
      return mutation.mutateAsync(patch)
    },
    isSaving: mutation.isPending,
  }
}
