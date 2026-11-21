import { useMutation, useQueryClient } from '@tanstack/react-query'
import { transfersApi, type TransferInput } from '../api/client'
import type { Transfer } from '../types'
import { useAccounts } from './useDomain'

/** A one-field patch over TransferInput. Every key is independently
 * patchable: the hook re-sends the complete payload from the loaded row
 * with the patch applied on top, so a one-field edit can never clear
 * another field. */
export type TransferFieldPatch = Partial<TransferInput>

/**
 * One-field saves for the transfer record. `update` is a full-replace
 * PUT, so each save re-sends the COMPLETE TransferInput: every field
 * forwarded unchanged from the loaded transfer with the patch on top -
 * exactly the payload useTransferForm.submit assembles. `to_amount` is
 * always sent: null while the effective pair is same-currency (the
 * server defaults it to from_amount - an explicit value there would 400),
 * the stored value while cross-currency (null there would 400).
 * `description` is always sent as a string, never omitted (the form's
 * contract; the backend default is '').
 *
 * Editors own value normalization before calling `save` (description
 * trimmed, amounts dot-decimal and positive): the hook forwards patch
 * values verbatim.
 *
 * `save` rejects on failure: the editor owns error display (EditableField
 * shows the server message under the row and restores the previous
 * value), so this hook never toasts. `isSaving` spans the PUT through its
 * invalidation dispatch; callers must keep other editors closed while it
 * is true - two overlapping full PUTs built from the same base row make
 * the second silently revert the first field.
 */
export function useTransferFieldSave(transfer: Transfer): {
  save: (patch: TransferFieldPatch) => Promise<Transfer>
  isSaving: boolean
} {
  const queryClient = useQueryClient()
  // Active accounts resolve the effective pair's currencies for the
  // to_amount rule below (the record's pickers offer active accounts
  // either). An id missing from the active list (archived since - the
  // backend still allows editing such rows) falls back to the row's own
  // currency codes, which are the stored truth for that side.
  const { data: accounts = [] } = useAccounts(false)

  const mutation = useMutation({
    mutationFn: (patch: TransferFieldPatch) => {
      const fromId = patch.from_account_id ?? transfer.from_account_id
      const toId = patch.to_account_id ?? transfer.to_account_id
      const fromCurrency =
        accounts.find((a) => a.id === fromId)?.currency_code ?? transfer.from_currency_code
      const toCurrency =
        accounts.find((a) => a.id === toId)?.currency_code ?? transfer.to_currency_code
      const crossCurrency = fromCurrency !== toCurrency
      const payload: TransferInput = {
        from_account_id: fromId,
        to_account_id: toId,
        from_amount: transfer.from_amount,
        // Always sent. Same-currency null lets the server default it to
        // from_amount (the form's exact rule); cross-currency forwards the
        // stored value - including the retarget case (a formerly
        // same-currency pair retargeted onto a new currency forwards
        // to_amount === from_amount, which the wire accepts and the now
        // visible second amount row invites correcting; null would 400).
        to_amount: crossCurrency ? transfer.to_amount : null,
        date: transfer.date,
        description: transfer.description,
        ...patch,
      }
      return transfersApi.update(transfer.id, payload)
    },
    onSuccess: () => {
      // The same three invalidations the transfer form's save mutation
      // issues. The ['transfers'] prefix also refetches this record's own
      // ['transfers', 'detail', id] entry (TanStack prefix match), which
      // is what re-renders the record with the saved row.
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
    },
  })

  return {
    save: (patch: TransferFieldPatch) => mutation.mutateAsync(patch),
    isSaving: mutation.isPending,
  }
}
