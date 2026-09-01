import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import Modal from '../../common/Modal'
import DatePicker from '../../DatePicker'
import { budgetsApi } from '../../../api/client'
import type { Period } from '../../../types'
import { formatPeriodName } from '../../../utils/format'
import { getApiErrorMessage } from '../../../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

interface Props {
  mode: 'add' | 'edit'
  budgetId: number
  /** Edit source; null in add mode. */
  period: Period | null
  onClose: () => void
}

/** The day `days` after an ISO date, as an ISO date (local, no TZ shifts).
    Same arithmetic as BudgetDetailPage's nextDayIso, generalized. */
function plusDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const next = new Date(y, m - 1, d + days)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

/**
 * Add/edit form for a custom budget period. Mount-per-use modal shape:
 * fields seed from `mode`/`period` in the
 * useState initializers, so the caller must render this component ONLY while
 * the form is open (unmount on close, per-session `key`) — that remount is
 * what re-seeds state for the next session, with zero open-effects.
 */
export default function PeriodFormModal({ mode, budgetId, period, onClose }: Props) {
  const { t } = useTranslation('budgets')
  const queryClient = useQueryClient()
  const isEdit = mode === 'edit' && !!period

  // Prefill via lazy initializers, NOT an open-effect: mount-per-use (see
  // docblock) — the caller's conditional render remounts this component per
  // open session, so these re-run every time and state can never leak across
  // sessions — and the react-hooks/set-state-in-effect budget stays frozen.
  const [start, setStart] = useState(() =>
    isEdit ? period!.start_date : new Date().toISOString().slice(0, 10),
  )
  const [end, setEnd] = useState(() =>
    isEdit ? period!.end_date : plusDaysIso(new Date().toISOString().slice(0, 10), 29),
  )
  const [name, setName] = useState(() => (isEdit ? period!.name : formatPeriodName(start, end)))
  // Name is derived from the dates until the user edits it manually.
  const [nameTouched, setNameTouched] = useState(false)

  const handleStartChange = (value: string) => {
    setStart(value)
    if (!nameTouched) setName(formatPeriodName(value, end))
  }
  const handleEndChange = (value: string) => {
    setEnd(value)
    if (!nameTouched) setName(formatPeriodName(start, value))
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), start_date: start, end_date: end }
      return isEdit
        ? budgetsApi.updatePeriod(budgetId, period!.id, payload)
        : budgetsApi.createPeriod(budgetId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['periods', budgetId] })
      // Prefix without periodId: date edits move actuals between periods.
      queryClient.invalidateQueries({ queryKey: ['budget-summary', budgetId] })
      // BudgetInsights history is period-keyed: ['budget-history', budgetId, periodId|null].
      queryClient.invalidateQueries({ queryKey: ['budget-history', budgetId] })
      // ['current-period', budgetId] never fires for custom budgets — leave it alone.
      toast.success(isEdit ? t('periodForm.updated') : t('periodForm.created'))
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('periodForm.saveFailed'))),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error(t('periodForm.nameRequired'))
    if (end < start) return toast.error(t('periodForm.endAfterStart'))
    mutation.mutate()
  }

  return (
    // size="md" per components.md §11 — sm is reserved for confirms/prompts.
    // `open` hardcoded: mount-per-use, the caller's render IS the open state.
    <Modal open onClose={onClose} size="md" className="p-6" title={isEdit ? t('periodForm.editTitle') : t('periodForm.addTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dates first, name second: the name derives from the dates, so the
            pair leads and the prefilled name follows (mobile: single column). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="period-start" className={labelClass}>{t('periodForm.startLabel')}</label>
            <DatePicker id="period-start" value={start} onChange={handleStartChange} placeholder={t('periodForm.startPlaceholder')} />
          </div>
          <div>
            <label htmlFor="period-end" className={labelClass}>{t('periodForm.endLabel')}</label>
            <DatePicker id="period-end" value={end} onChange={handleEndChange} placeholder={t('periodForm.endPlaceholder')} />
          </div>
        </div>
        <div>
          <label htmlFor="period-name" className={labelClass}>{t('periodForm.nameLabel')}</label>
          {/* Backend PeriodCreate caps names at 100 chars. No autoFocus: the
              first field is a read-only date input — focusing it would pop the
              calendar open over a freshly mounted modal. */}
          <input
            id="period-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameTouched(true) }}
            maxLength={100}
            className={inputClass}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('periodForm.cancel')}</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? t('periodForm.saving') : isEdit ? t('periodForm.save') : t('periodForm.add')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
