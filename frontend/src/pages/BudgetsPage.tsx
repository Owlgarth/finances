import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Pencil, Plus, PieChart, Trash2 } from 'lucide-react'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { budgetsApi } from '../api/client'
import type { Budget, Cadence } from '../types'
import { useBudgets } from '../hooks/useDomain'
import { useIsTouch } from '../hooks/useBreakpoint'
import { usePermissions } from '../hooks/usePermissions'
import { getApiErrorMessage } from '../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'
import Select from '../components/common/Select'
import DatePicker from '../components/DatePicker'

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weeks', label: 'Every N weeks' },
  { value: 'custom', label: 'Custom periods' },
]

function CreateBudgetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  // No autofocus on touch — don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [weeks, setWeeks] = useState('2')
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10))

  // This wrapper stays mounted while BudgetsPage is up (Modal only hides it), so
  // form state would otherwise survive across opens — a create-after-create or a
  // long-lived session would mix a blank name with a stale cadence/weeks/anchor.
  // Modal funnels every dismissal path (Cancel, Close, scrim, Escape) through
  // onClose, and success routes here too: full reset + a fresh anchor for the
  // next open. Event handler, not an effect — keeps set-state-in-effect quiet.
  const handleClose = () => {
    setName('')
    setCadence('monthly')
    setWeeks('2')
    setAnchor(new Date().toISOString().slice(0, 10))
    onClose()
  }

  const mutation = useMutation({
    mutationFn: () =>
      budgetsApi.create({
        name: name.trim(),
        cadence,
        cadence_weeks: cadence === 'weeks' ? parseInt(weeks, 10) : null,
        cadence_anchor: cadence === 'weeks' ? anchor : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success('Budget created')
      handleClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to create budget')),
  })

  return (
    <Modal open={open} onClose={handleClose} className="p-6" title="New budget">
      <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return toast.error('Name required'); mutation.mutate() }} className="space-y-4">
        <div>
          <label htmlFor="budget-name" className={labelClass}>Name</label>
          <input id="budget-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>
        <div>
          <label className={labelClass}>Cadence</label>
          <Select value={cadence} onChange={setCadence} options={CADENCE_OPTIONS} aria-label="Cadence" />
        </div>
        {cadence === 'weeks' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="budget-weeks" className={labelClass}>Every N weeks</label>
              <input id="budget-weeks" type="number" inputMode="numeric" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Anchor date</label>
              <DatePicker value={anchor} onChange={setAnchor} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RenameBudgetModal({ budget, onClose }: { budget: Budget | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  // No autofocus on touch — don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const [name, setName] = useState('')

  useEffect(() => {
    if (budget) setName(budget.name)
  }, [budget])

  const mutation = useMutation({
    mutationFn: () => budgetsApi.update(budget!.id, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      queryClient.invalidateQueries({ queryKey: ['budget', budget!.id] })
      toast.success('Budget renamed')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to rename budget')),
  })

  return (
    <Modal open={!!budget} onClose={onClose} className="p-6" title="Rename budget">
      <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return toast.error('Name required'); mutation.mutate() }} className="space-y-4">
        <div>
          <label htmlFor="budget-rename" className={labelClass}>Name</label>
          <input id="budget-rename" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function BudgetsPage() {
  const queryClient = useQueryClient()
  const { canManageAccounts } = usePermissions()
  const { data: budgets = [], isLoading } = useBudgets(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renaming, setRenaming] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => budgetsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      queryClient.invalidateQueries({ queryKey: ['workspace-categories'] })
      toast.success('Budget deleted')
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete budget'))
      setDeleting(null)
    },
  })

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">Budgets</h1>
        {canManageAccounts && (
          <button onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
            <Plus size={13} className="inline mr-1" /> New budget
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[0, 1].map((i) => <div key={i} className="h-20 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : budgets.length === 0 ? (
        <p className="text-sm text-text-muted">No budgets yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {budgets.map((b) => (
            <Link key={b.id} to={`/budgets/${b.id}`} className="border border-border rounded-sm bg-surface p-4 hover:bg-surface-hover active:bg-surface-hover transition-colors">
              <div className="flex items-center gap-2">
                <PieChart size={16} className="text-text-muted" />
                <span className="text-sm font-medium text-text truncate">{b.name}</span>
                {canManageAccounts && (
                  /* Adjacent icon buttons: real padded hit areas instead of
                     .touch-hit, whose expanded areas would overlap
                     (responsive.md). On coarse pointers they grow to the 44px
                     floor; -my keeps the card header height unchanged. */
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenaming(b) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-text"
                      title="Rename"
                      aria-label={`Rename budget ${b.name}`}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleting(b) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-negative"
                      title="Delete"
                      aria-label={`Delete budget ${b.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                )}
              </div>
              <div className="mt-2 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                {b.cadence === 'weeks' ? `Every ${b.cadence_weeks} weeks` : b.cadence}
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateBudgetModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <RenameBudgetModal budget={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        isOpen={!!deleting}
        title="Delete budget"
        message={`Delete "${deleting?.name}"? Its periods and categories will be deleted, and transactions in those categories will become uncategorized. This cannot be undone.`}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
        isPending={deleteMutation.isPending}
      />
    </div>
  )
}
