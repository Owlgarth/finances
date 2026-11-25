import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { recurringTransactionsApi } from '../api/client'
import { getApiErrorMessage } from '../utils/errors'

/** Deletes a recurring rule, optionally with its pending planned rows. Every
 *  host of the delete confirm (the list, the rule page, the rule panel) shares
 *  the request, the refetches and the toasts. What happens next on screen
 *  (closing the confirm, leaving the deleted rule's route) stays with the
 *  host: pass it as the per-call callbacks of mutate, which run after these. */
export function useRecurringRuleDelete() {
  const { t } = useTranslation('planned')
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: number; deletePending: boolean }) =>
      recurringTransactionsApi.delete(input.id, input.deletePending),
    onSuccess: () => {
      // delete_pending can remove planned rows, so both lists refetch.
      queryClient.invalidateQueries({ queryKey: ['recurring'] })
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(t('recurring.deleted'))
    },
    onError: (error) => { toast.error(getApiErrorMessage(error, t('recurring.deleteFailed'))) },
  })
}
