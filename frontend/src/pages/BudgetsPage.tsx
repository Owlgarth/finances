import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CalendarRange, Pencil, Plus, PieChart, Trash2 } from 'lucide-react'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import PeriodFormModal from '../components/modals/budgets/PeriodFormModal'
import { budgetsApi } from '../api/client'
import type { Budget, Cadence } from '../types'
import { useBudgets } from '../hooks/useDomain'
import { useIsTouch } from '../hooks/useBreakpoint'
import { usePermissions } from '../hooks/usePermissions'
import { getApiErrorMessage } from '../utils/errors'
import { formatPeriodName } from '../utils/format'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'
import Select from '../components/common/Select'
import DatePicker from '../components/DatePicker'

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weeks', label: 'Every N weeks' },
  { value: 'custom', label: 'Custom periods' },
]

// Default custom-period window: today through today + 29 days (a 30-day
// window), pre-named with formatPeriodName exactly as date changes re-name
// it. Reused by the state initializers and handleClose so a reopened modal
// always shows fresh defaults. UTC-based toISOString, matching the
// anchor-date initializer's existing semantics.
function initialCustomPeriod(): { start: string; end: string; name: string } {
  const start = new Date().toISOString().slice(0, 10)
  const end = new Date()
  end.setDate(end.getDate() + 29)
  const endIso = end.toISOString().slice(0, 10)
  return { start, end: endIso, name: formatPeriodName(start, endIso) }
}

function CreateBudgetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  // No autofocus on touch — don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [weeks, setWeeks] = useState('2')
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10))
  // Lazy initializers run once (this modal stays mounted while the page is
  // up); handleClose regenerates everything on close.
  const [customStart, setCustomStart] = useState(() => initialCustomPeriod().start)
  const [customEnd, setCustomEnd] = useState(() => initialCustomPeriod().end)
  const [customName, setCustomName] = useState(() => initialCustomPeriod().name)
  // Once the user edits the period name, date changes stop re-deriving it.
  const [nameTouched, setNameTouched] = useState(false)

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
    const initial = initialCustomPeriod()
    setCustomStart(initial.start)
    setCustomEnd(initial.end)
    setCustomName(initial.name)
    setNameTouched(false)
    onClose()
  }

  // Custom cadence: create the budget, then chain its first period — custom
  // ranges are never derived server-side (PeriodService.compute_range raises
  // NoPeriodForDateError for CUSTOM), so without this the new budget has no
  // periods until one is added from the budget page.
  const mutation = useMutation({
    mutationFn: async () => {
      const budget = await budgetsApi.create({
        name: name.trim(),
        cadence,
        cadence_weeks: cadence === 'weeks' ? parseInt(weeks, 10) : null,
        cadence_anchor: cadence === 'weeks' ? anchor : null,
      })
      if (cadence === 'custom') {
        try {
          await budgetsApi.createPeriod(budget.id, {
            name: customName.trim(),
            start_date: customStart,
            end_date: customEnd,
          })
        } catch (error) {
          // The budget exists; only the first period failed. Point the user
          // at the recovery path but treat the overall create as successful.
          toast.error(`${getApiErrorMessage(error, 'Failed to create the first period')} — you can add it from the budget page.`)
        }
      }
      return budget
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success('Budget created')
      handleClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to create budget')),
  })

  return (
    <Modal open={open} onClose={handleClose} className="p-6" title="New budget">
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return toast.error('Name required')
        if (cadence === 'custom') {
          if (!customName.trim()) return toast.error('Period name required')
          // yyyy-MM-dd strings compare correctly lexicographically.
          if (customEnd < customStart) return toast.error('End date must be on or after the start date')
        }
        mutation.mutate()
      }} className="space-y-4">
        <div>
          <label htmlFor="budget-name" className={labelClass}>Name</label>
          <input id="budget-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>
        <div>
          <label className={labelClass}>Cadence</label>
          <Select value={cadence} onChange={setCadence} options={CADENCE_OPTIONS} aria-label="Cadence" />
        </div>
        {cadence === 'weeks' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        {cadence === 'custom' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="budget-period-start" className={labelClass}>Start date</label>
                <DatePicker
                  id="budget-period-start"
                  placeholder="Start"
                  value={customStart}
                  onChange={(v) => {
                    setCustomStart(v)
                    if (!nameTouched) setCustomName(formatPeriodName(v, customEnd))
                  }}
                />
              </div>
              <div>
                <label htmlFor="budget-period-end" className={labelClass}>End date</label>
                <DatePicker
                  id="budget-period-end"
                  placeholder="End"
                  value={customEnd}
                  onChange={(v) => {
                    setCustomEnd(v)
                    if (!nameTouched) setCustomName(formatPeriodName(customStart, v))
                  }}
                />
              </div>
            </div>
            <div>
              <label htmlFor="budget-period-name" className={labelClass}>Period name</label>
              <input
                id="budget-period-name"
                value={customName}
                onChange={(e) => { setNameTouched(true); setCustomName(e.target.value) }}
                className={inputClass}
              />
            </div>
          </>
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canManageAccounts } = usePermissions()
  const { data: budgets = [], isLoading } = useBudgets(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [renaming, setRenaming] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)
  // Add-period modal (mount-per-use, PeriodFormModal docblock): the
  // per-session key forces a fresh remount so the modal's lazy useState
  // initializers re-run - add-after-add on the same budget opens fresh
  // defaults, not stale state. The nonce also covers a batched
  // close-then-open in one tick (the null gap never renders), where the
  // id alone would reuse the mounted instance.
  const [periodModalBudget, setPeriodModalBudget] = useState<Budget | null>(null)
  const [periodModalNonce, setPeriodModalNonce] = useState(0)
  const openPeriodModal = (b: Budget) => {
    setPeriodModalBudget(b)
    setPeriodModalNonce((n) => n + 1)
  }

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
                {/* Adjacent icon buttons: real padded hit areas instead of
                    .touch-hit, whose expanded areas would overlap
                    (responsive.md). On coarse pointers they grow to the 44px
                    floor; -my keeps the card header height unchanged.
                    View-periods is read-only (all roles); add-period gates
                    on custom cadence + admin, the same predicate as
                    BudgetDetailPage's period-management cluster. Buttons,
                    not nested Links - a Link cannot nest inside the card's
                    Link; preventDefault + stopPropagation keep the click
                    from triggering the card's own navigation. */}
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/budgets/${b.id}/periods`) }}
                    className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-text"
                    title="View periods"
                    aria-label={`View periods for ${b.name}`}
                  >
                    <CalendarRange size={13} />
                  </button>
                  {b.cadence === 'custom' && canManageAccounts && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPeriodModal(b) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-text"
                      title="Add period"
                      aria-label={`Add period to ${b.name}`}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                  {canManageAccounts && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenaming(b) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-text"
                      title="Rename"
                      aria-label={`Rename budget ${b.name}`}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {canManageAccounts && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleting(b) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-negative"
                      title="Delete"
                      aria-label={`Delete budget ${b.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </span>
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
      {periodModalBudget && (
        <PeriodFormModal
          key={`add-${periodModalBudget.id}-${periodModalNonce}`}
          mode="add"
          budgetId={periodModalBudget.id}
          period={null}
          onClose={() => setPeriodModalBudget(null)}
        />
      )}
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
