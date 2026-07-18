import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CheckCircle, Copy, Trash2 } from 'lucide-react'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import DatePicker from '../../DatePicker'
import { budgetsApi, plannedTransactionsApi } from '../../../api/client'
import type { PlannedTransaction } from '../../../types'
import { useAccounts, useBudgets } from '../../../hooks/useDomain'
import { useIsTouch } from '../../../hooks/useBreakpoint'
import { useWorkspace } from '../../../contexts/WorkspaceContext'
import { getApiErrorMessage } from '../../../utils/errors'
import { destructiveButtonClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

interface Props {
  open: boolean
  onClose: () => void
  planned?: PlannedTransaction | null
  /** Copy mode: prefill every field from this planned transaction except the
      date (today instead) and save as a NEW pending one. Ignored while editing. */
  copyFrom?: PlannedTransaction | null
  /** Edit mode only: renders a Delete button in the footer. Caller owns the
      confirm flow (and closing this modal). */
  onDelete?: (planned: PlannedTransaction) => void
  /** Edit mode only: renders a Copy button in the footer. Caller switches the
      modal into copy mode (planned=null, copyFrom=p). */
  onCopy?: (planned: PlannedTransaction) => void
  /** Edit mode only, pending rows: renders an Execute button in the footer.
      Caller closes this modal and runs the execute mutation. */
  onExecute?: (planned: PlannedTransaction) => void
}

// Positive counterpart of destructiveButtonClass, for Execute.
const executeButtonClass =
  secondaryButtonClass.replace('text-text ', 'text-positive ').replace('hover:bg-surface-hover ', 'hover:bg-positive-bg ')

export default function PlannedFormModal({ open, onClose, planned, copyFrom, onDelete, onCopy, onExecute }: Props) {
  const isEdit = !!planned
  const queryClient = useQueryClient()
  // No autofocus on touch — don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const { workspace } = useWorkspace()
  const { data: accounts = [] } = useAccounts(false)
  const { data: budgets = [] } = useBudgets(false)

  const defaultBudgetId =
    budgets.length === 1 ? budgets[0].id : (budgets.find((b) => b.id === workspace?.default_budget_id)?.id ?? null)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<number | null>(null)
  const [budgetId, setBudgetId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [plannedDate, setPlannedDate] = useState(new Date().toISOString().slice(0, 10))

  useEffect(() => {
    if (!open) return
    // Copy mode prefills like edit, except the date: always today (D4).
    const source = planned ?? copyFrom
    if (source) {
      setName(source.name)
      setAmount(source.amount)
      setAccountId(source.account_id)
      setCategoryId(source.category_id)
      setBudgetId(source.category?.budget_id ?? null)
      setPlannedDate(planned ? source.planned_date : new Date().toISOString().slice(0, 10))
    } else {
      setName('')
      setAmount('')
      setAccountId(accounts.length === 1 ? accounts[0].id : null)
      setBudgetId(defaultBudgetId)
      setCategoryId(null)
      setPlannedDate(new Date().toISOString().slice(0, 10))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planned, copyFrom, accounts.length, budgets.length, defaultBudgetId])

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', budgetId],
    queryFn: () => budgetsApi.listCategories(budgetId!),
    enabled: open && !!budgetId,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), amount, account_id: accountId, category_id: categoryId, planned_date: plannedDate }
      // Echo the current status back on edit: the schema defaults a missing
      // status to 'pending', which the backend rejects as a revert for done rows.
      return isEdit ? plannedTransactionsApi.update(planned.id, { ...payload, status: planned.status }) : plannedTransactionsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planned'] })
      toast.success(isEdit ? 'Updated' : 'Planned added')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to save')),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error('Name is required')
    if (!amount) return toast.error('Amount is required')
    if (!accountId && accounts.length !== 1) return toast.error('Choose an account')
    mutation.mutate()
  }

  return (
    <Modal open={open} onClose={onClose} className="p-6" title={isEdit ? 'Edit planned' : 'New planned transaction'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="planned-name" className={labelClass}>Name</label>
          <input id="planned-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="planned-amount" className={labelClass}>Amount</label>
            <input id="planned-amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Date</label>
            <DatePicker value={plannedDate} onChange={setPlannedDate} />
          </div>
        </div>
        {accounts.length > 1 && (
          <div>
            <label className={labelClass}>Account</label>
            <Select value={accountId} onChange={setAccountId} options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency_code})` }))} placeholder="Select account" aria-label="Account" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {budgets.length > 1 && (
            <div>
              <label className={labelClass}>Budget</label>
              <Select value={budgetId} onChange={(v) => { setBudgetId(v); setCategoryId(null) }} options={budgets.map((b) => ({ value: b.id, label: b.name }))} placeholder="Budget" aria-label="Budget" />
            </div>
          )}
          <div className={budgets.length > 1 ? '' : 'col-span-2'}>
            <label className={labelClass}>Category (optional)</label>
            <Select value={categoryId} onChange={setCategoryId} options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="Uncategorized" aria-label="Category" disabled={!budgetId} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 pb-4">
          {/* Separate, individually clickable actions (never a menu). */}
          {isEdit && planned && (
            <div className="flex items-center gap-2">
              {onExecute && planned.status === 'pending' && (
                <button type="button" onClick={() => onExecute(planned)} className={executeButtonClass}>
                  <CheckCircle size={13} className="inline mr-1" /> Execute
                </button>
              )}
              {onCopy && (
                <button type="button" onClick={() => onCopy(planned)} className={secondaryButtonClass}>
                  <Copy size={13} className="inline mr-1" /> Copy
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(planned)} className={destructiveButtonClass}>
                  <Trash2 size={13} className="inline mr-1" /> Delete
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
            <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>{mutation.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add'}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
