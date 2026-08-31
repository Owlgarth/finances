import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarRange, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { budgetsApi } from '../api/client'
import type { Period } from '../types'
import { usePermissions } from '../hooks/usePermissions'
import { getApiErrorMessage } from '../utils/errors'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import PeriodCard from '../components/budgets/PeriodCard'
import PeriodFormModal from '../components/modals/budgets/PeriodFormModal'
import { primaryButtonClass } from '../components/common/formStyles'

interface PeriodGroup {
  year: string
  periods: Period[]
}

/** Group newest-first periods by start year, preserving list order. The API
 *  orders by -start_date (Period Meta ordering), so years are monotonically
 *  non-increasing and equal years are adjacent - same premise as
 *  PeriodPicker's groups reduce, minus the listbox flat-index threading this
 *  page does not need. */
function groupPeriodsByYear(periods: Period[]): PeriodGroup[] {
  return periods.reduce<PeriodGroup[]>((acc, period) => {
    const year = period.start_date.slice(0, 4)
    const last = acc[acc.length - 1]
    if (last && last.year === year) last.periods.push(period)
    else acc.push({ year, periods: [period] })
    return acc
  }, [])
}

/**
 * All periods of one budget as a year-sectioned card grid, newest year first.
 * Cards deep-link into the budget detail page via ?period=<id>. Add/edit/delete
 * management exists only for custom-cadence budgets (add button) and custom
 * periods (card icons); PeriodFormModal owns add/edit invalidation, this page
 * owns delete invalidation. Zero effects by construction - modal/dialog
 * state is event-handler-only, so the set-state-in-effect baseline is safe.
 */
export default function BudgetPeriodsPage() {
  const { t } = useTranslation('budgets')
  const { id } = useParams<{ id: string }>()
  const budgetId = Number(id)
  const queryClient = useQueryClient()
  const { canManageAccounts } = usePermissions()

  const { data: budget } = useQuery({ queryKey: ['budget', budgetId], queryFn: () => budgetsApi.get(budgetId) })
  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['periods', budgetId],
    queryFn: () => budgetsApi.listPeriods(budgetId),
    // Cross-tab convergence - same rationale as BudgetDetailPage and the
    // useDomain list hooks (staleTime would otherwise mask other-tab deletes).
    refetchOnWindowFocus: 'always',
  })

  // Period add/edit is a custom-cadence, admin-only feature (BudgetDetailPage
  // line 429 idiom). While budget is undefined (first render) this is false -
  // the button simply appears one render later, no doomed request involved.
  const canAddPeriod = budget?.cadence === 'custom' && canManageAccounts

  // Custom-cadence period management state. `nonce` forces a keyed remount of
  // PeriodFormModal per open session so its lazy state initializers re-run -
  // edit prefill and add-mode defaults with zero open-effects (mount-per-use;
  // BudgetDetailPage lines 208-214 idiom).
  const [periodModal, setPeriodModal] = useState<{ mode: 'add' | 'edit'; period: Period | null; nonce: number } | null>(null)
  const [deletingPeriod, setDeletingPeriod] = useState<Period | null>(null)
  const openPeriodModal = (mode: 'add' | 'edit', period: Period | null = null) =>
    setPeriodModal({ mode, period, nonce: Date.now() })

  // Page-owned delete (invalidation ownership follows mutation ownership: the
  // form modal invalidates its own add/edit, the page invalidates delete).
  // Mirrors BudgetDetailPage's deletePeriod plus PeriodFormModal's set.
  // Simpler than the detail page: there is NO selected-period state here, so
  // there is nothing to clear after the awaited refetch - the await only
  // orders the refetch before the dialog closes and the toast fires.
  const deletePeriod = useMutation({
    mutationFn: (periodId: number) => budgetsApi.deletePeriod(budgetId, periodId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['periods', budgetId] })
      // Prefix without periodId: date edits move actuals between periods.
      queryClient.invalidateQueries({ queryKey: ['budget-summary', budgetId] })
      // BudgetInsights history is period-keyed: ['budget-history', budgetId, periodId|null].
      queryClient.invalidateQueries({ queryKey: ['budget-history', budgetId] })
      toast.success(t('detail.periodDeleted'))
      setDeletingPeriod(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('detail.deletePeriodFailed')))
      setDeletingPeriod(null)
    },
  })

  const groups = groupPeriodsByYear(periods)

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <Link
        to={`/budgets/${budgetId}`}
        className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text mb-4 max-sm:min-h-[44px]"
      >
        <ArrowLeft size={13} /> {budget?.name ?? t('budgetFallback')}
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">{t('periods.title')}</h1>
        {canAddPeriod && (
          <button type="button" onClick={() => openPeriodModal('add')} className={primaryButtonClass}>
            <Plus size={13} className="inline mr-1" /> {t('periods.addPeriod')}
          </button>
        )}
      </div>

      {isLoading ? (
        /* Six pulse cards in the real grid shape (BudgetsPage line 263 idiom,
           sized to the two-column layout the data will fill). */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-surface-muted rounded-sm animate-pulse" />
          ))}
        </div>
      ) : periods.length === 0 ? (
        /* Empty list. For custom budgets this is the designed empty state
           (patterns.md "Periods" row, BudgetDetailPage lines 481-490 mirror);
           non-custom budgets materialize periods on demand from the budget
           page, so an empty list there is transient - CTA stays custom-only. */
        <EmptyState
          icon={<CalendarRange size={48} strokeWidth={1.5} className="text-text-muted/30" />}
          heading={t('periods.emptyHeading')}
          message={t('periods.emptyMessage')}
          action={canAddPeriod ? { label: t('periods.addPeriod'), onClick: () => openPeriodModal('add') } : undefined}
        />
      ) : (
        /* Year sections are per-year blocks: each year renders its own header
           and its own grid, separated by space-y-6 - NOT col-span-full headers
           inside one continuous grid (that leaves ragged year boundaries when
           a year's count is odd). Newest year first (the list is newest-first
           and the grouping preserves list order). */
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.year}>
              <h2 className="font-mono text-[10px] uppercase tracking-wider text-text-muted/60 mb-2">
                {group.year}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.periods.map((p) => (
                  <PeriodCard
                    key={p.id}
                    period={p}
                    budgetId={budgetId}
                    onEdit={(period) => openPeriodModal('edit', period)}
                    onDelete={setDeletingPeriod}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mount-per-use: the conditional render IS the open/close mechanism;
          the key (mode + period id + nonce) forces a fresh remount every
          open, including add-after-add. The modal owns its invalidations. */}
      {periodModal && (
        <PeriodFormModal
          key={`${periodModal.mode}-${periodModal.period?.id ?? 'new'}-${periodModal.nonce}`}
          mode={periodModal.mode}
          budgetId={budgetId}
          period={periodModal.period}
          onClose={() => setPeriodModal(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!deletingPeriod}
        title={t('detail.deletePeriodDialog.title')}
        message={t('detail.deletePeriodDialog.message', { name: deletingPeriod?.name })}
        onConfirm={() => deletingPeriod && deletePeriod.mutate(deletingPeriod.id)}
        onCancel={() => setDeletingPeriod(null)}
        isPending={deletePeriod.isPending}
      />
    </div>
  )
}
