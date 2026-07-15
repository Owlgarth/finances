import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Plus, PieChart } from 'lucide-react'
import Modal from '../components/common/Modal'
import { budgetsApi } from '../api/client'
import type { Cadence } from '../types'
import { useBudgets } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { getApiErrorMessage } from '../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass, modalTitleClass } from '../components/common/formStyles'
import Select from '../components/common/Select'
import DatePicker from '../components/DatePicker'

const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weeks', label: 'Every N weeks' },
  { value: 'custom', label: 'Custom periods' },
]

function CreateBudgetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [weeks, setWeeks] = useState('2')
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10))

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
      setName('')
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to create budget')),
  })

  return (
    <Modal open={open} onClose={onClose} className="p-6">
      <h2 className={modalTitleClass}>New budget</h2>
      <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return toast.error('Name required'); mutation.mutate() }} className="space-y-4">
        <div>
          <label htmlFor="budget-name" className={labelClass}>Name</label>
          <input id="budget-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus />
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
          <button type="button" onClick={onClose} className={secondaryButtonClass}>Cancel</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function BudgetsPage() {
  const { canManageAccounts } = usePermissions()
  const { data: budgets = [], isLoading } = useBudgets(false)
  const [createOpen, setCreateOpen] = useState(false)

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
                <span className="text-sm font-medium text-text">{b.name}</span>
              </div>
              <div className="mt-2 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                {b.cadence === 'weeks' ? `Every ${b.cadence_weeks} weeks` : b.cadence}
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateBudgetModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
