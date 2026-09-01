import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Archive, CalendarRange, Pencil, Plus, PieChart, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import PeriodFormModal from '../components/modals/budgets/PeriodFormModal'
import CurrencySetField from '../components/currencies/CurrencySetField'
import WorkspaceSettingsPanel from '../components/layout/WorkspaceSettingsPanel'
import { budgetsApi } from '../api/client'
import type { Budget, Cadence } from '../types'
import { useBudgets, useEnabledCurrencies } from '../hooks/useDomain'
import { useIsTouch } from '../hooks/useBreakpoint'
import { usePermissions } from '../hooks/usePermissions'
import { getApiErrorMessage } from '../utils/errors'
import { formatPeriodName } from '../utils/format'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'
import Select from '../components/common/Select'
import DatePicker from '../components/DatePicker'

// Keys only: t() is resolved at render time inside the components (a
// module-level t() would freeze the language at load time). `as const`
// keeps labelKey a literal union so t(o.labelKey) is checked against the
// budgets catalog.
const CADENCE_OPTIONS = [
  { value: 'monthly', labelKey: 'cadence.monthly' },
  { value: 'weeks', labelKey: 'cadence.weeks' },
  { value: 'custom', labelKey: 'cadence.custom' },
] as const

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

// Card currency row: codes joined with a " · " separator (e.g. "USD · EUR");
// past the cap the rest collapse into a "+N" suffix so no code is ever
// truncated mid-glyph (natural wrapping is allowed, truncate is not).
const CARD_CURRENCY_CAP = 7
function formatCardCurrencyCodes(codes: string[]): string {
  const shown = codes.slice(0, CARD_CURRENCY_CAP).join(' · ')
  return codes.length > CARD_CURRENCY_CAP ? `${shown} +${codes.length - CARD_CURRENCY_CAP}` : shown
}

function CreateBudgetModal({ open, onClose, onManageCurrencies }: { open: boolean; onClose: () => void; onManageCurrencies?: () => void }) {
  const { t } = useTranslation('budgets')
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
  // Currencies the budget plans for, order-significant (index 0 = shown
  // first). Single source of truth in this modal: the field appends new
  // picks at the end and removes deselections; only its arrow list reorders.
  const { data: currencies = [] } = useEnabledCurrencies()
  const [currencyCodes, setCurrencyCodes] = useState<string[]>([])
  // Derived-until-touched (same shape as nameTouched above): until the user
  // edits the set, an empty selection shows and submits [primary] - the
  // FIRST entry of the enabled list, which the backend orders with the
  // workspace's primary currency first. A PLN-primary workspace therefore
  // preselects PLN even though EUR sorts first alphabetically. Users add
  // more currencies deliberately (light default).
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const effectiveCurrencyCodes =
    currencyTouched || currencies.length === 0 ? currencyCodes : [currencies[0].code]

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
    setCurrencyCodes([])
    setCurrencyTouched(false)
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
        currency_codes: effectiveCurrencyCodes,
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
          toast.error(t('createForm.firstPeriodFailed', {
            message: getApiErrorMessage(error, t('createForm.firstPeriodFailedFallback')),
          }))
        }
      }
      return budget
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success(t('createForm.created'))
      handleClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('createForm.createFailed'))),
  })

  return (
    <Modal open={open} onClose={handleClose} className="p-6" title={t('createForm.title')}>
      <form onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return toast.error(t('createForm.nameRequired'))
        if (cadence === 'custom') {
          if (!customName.trim()) return toast.error(t('createForm.periodNameRequired'))
          // yyyy-MM-dd strings compare correctly lexicographically.
          if (customEnd < customStart) return toast.error(t('createForm.endAfterStart'))
        }
        mutation.mutate()
      }} className="space-y-4">
        <div>
          <label htmlFor="budget-name" className={labelClass}>{t('createForm.nameLabel')}</label>
          <input id="budget-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>
        <div>
          <label className={labelClass}>{t('createForm.cadenceLabel')}</label>
          <Select
            value={cadence}
            onChange={setCadence}
            options={CADENCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            aria-label={t('createForm.cadenceLabel')}
          />
        </div>
        {cadence === 'weeks' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="budget-weeks" className={labelClass}>{t('createForm.weeksLabel')}</label>
              <input id="budget-weeks" type="number" inputMode="numeric" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('createForm.anchorLabel')}</label>
              <DatePicker value={anchor} onChange={setAnchor} />
            </div>
          </div>
        )}
        {cadence === 'custom' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="budget-period-start" className={labelClass}>{t('createForm.startLabel')}</label>
                <DatePicker
                  id="budget-period-start"
                  placeholder={t('createForm.startPlaceholder')}
                  value={customStart}
                  onChange={(v) => {
                    setCustomStart(v)
                    if (!nameTouched) setCustomName(formatPeriodName(v, customEnd))
                  }}
                />
              </div>
              <div>
                <label htmlFor="budget-period-end" className={labelClass}>{t('createForm.endLabel')}</label>
                <DatePicker
                  id="budget-period-end"
                  placeholder={t('createForm.endPlaceholder')}
                  value={customEnd}
                  onChange={(v) => {
                    setCustomEnd(v)
                    if (!nameTouched) setCustomName(formatPeriodName(customStart, v))
                  }}
                />
              </div>
            </div>
            <div>
              <label htmlFor="budget-period-name" className={labelClass}>{t('createForm.periodNameLabel')}</label>
              <input
                id="budget-period-name"
                value={customName}
                onChange={(e) => { setNameTouched(true); setCustomName(e.target.value) }}
                className={inputClass}
              />
            </div>
          </>
        )}
        <CurrencySetField
          value={effectiveCurrencyCodes}
          onChange={(next) => { setCurrencyTouched(true); setCurrencyCodes(next) }}
          onManageCurrencies={onManageCurrencies}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={handleClose} className={secondaryButtonClass}>{t('createForm.cancel')}</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? t('createForm.creating') : t('createForm.create')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Mount-per-use (PeriodFormModal's contract): fields seed from `budget` in
// the useState initializers, so the caller renders this component ONLY while
// the form is open (unmount on close). That remount re-seeds state per open
// with zero open-effects.
function EditBudgetModal({ budget, onClose, onManageCurrencies }: { budget: Budget; onClose: () => void; onManageCurrencies?: () => void }) {
  const { t } = useTranslation('budgets')
  const queryClient = useQueryClient()
  // No autofocus on touch - don't yank the keyboard up over a fresh modal.
  const isTouch = useIsTouch()
  const [name, setName] = useState(budget.name)
  // Single order-significant source of truth (index 0 = shown first): the
  // field appends new picks at the end and removes deselections; only its
  // arrow list reorders.
  const [currencyCodes, setCurrencyCodes] = useState<string[]>(budget.currency_codes)

  const mutation = useMutation({
    mutationFn: () => budgetsApi.update(budget.id, { name: name.trim(), currency_codes: currencyCodes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      // The detail page switcher reads ['budget', id].
      queryClient.invalidateQueries({ queryKey: ['budget', budget.id] })
      toast.success(t('editForm.updated'))
      onClose()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('editForm.updateFailed'))),
  })

  return (
    <Modal open onClose={onClose} className="p-6" title={t('editForm.title')}>
      <form onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return toast.error(t('editForm.nameRequired')); mutation.mutate() }} className="space-y-4">
        <div>
          <label htmlFor="budget-edit-name" className={labelClass}>{t('editForm.nameLabel')}</label>
          <input id="budget-edit-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} autoFocus={!isTouch} />
        </div>
        <CurrencySetField value={currencyCodes} onChange={setCurrencyCodes} onManageCurrencies={onManageCurrencies} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('editForm.cancel')}</button>
          <button type="submit" disabled={mutation.isPending} className={primaryButtonClass}>
            {mutation.isPending ? t('editForm.saving') : t('editForm.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function BudgetsPage() {
  const { t } = useTranslation('budgets')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canManageAccounts, canManageCurrencies } = usePermissions()
  const [showArchived, setShowArchived] = useState(false)
  const { data: budgets = [], isLoading } = useBudgets(showArchived)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [deleting, setDeleting] = useState<Budget | null>(null)
  // Workspace settings opened from the currency field's manage bridge; the
  // panel instance renders LAST so it stacks above the still-open form modal.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = () => setSettingsOpen(true)
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
      toast.success(t('deleted'))
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('deleteFailed')))
      setDeleting(null)
    },
  })

  // setArchive's second argument is isActive, so unarchive passes true. The
  // ['budgets'] prefix invalidation refreshes both the active and the
  // show-archived list (the key is ['budgets', showArchived]).
  const unarchiveMutation = useMutation({
    mutationFn: (id: number) => budgetsApi.setArchive(id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets'] })
      toast.success(t('unarchived'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('unarchiveFailed'))),
  })

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">{t('title')}</h1>
        {canManageAccounts && (
          <button onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
            <Plus size={13} className="inline mr-1" /> {t('newBudget')}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[0, 1].map((i) => <div key={i} className="h-20 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : budgets.length === 0 ? (
        <p className="text-sm text-text-muted">{t('noBudgetsYet')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {budgets.map((b) => (
            <Link key={b.id} to={`/budgets/${b.id}`} className="border border-border rounded-sm bg-surface p-4 hover:bg-surface-hover active:bg-surface-hover transition-colors">
              <div className="flex items-center gap-2">
                <PieChart size={16} className="text-text-muted" />
                {/* Archived budgets stay full cards and stay navigable - the
                    detail page works for them; only the presentation is
                    muted (badge chip identical to AccountsPage's). */}
                <span className={`text-sm font-medium truncate ${b.is_active ? 'text-text' : 'text-text-muted'}`}>{b.name}</span>
                {!b.is_active && (
                  <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted border border-border rounded-sm px-1.5 py-0.5">{t('archived')}</span>
                )}
                {/* Adjacent icon buttons: real padded hit areas instead of
                    the shared hit-area utility, whose expanded areas would
                    overlap (responsive.md). On coarse pointers they grow to
                    the 44px floor; -my keeps the card header height unchanged.
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
                    title={t('cardActions.viewPeriods')}
                    aria-label={t('cardActions.viewPeriodsAria', { name: b.name })}
                  >
                    <CalendarRange size={13} />
                  </button>
                  {b.cadence === 'custom' && canManageAccounts && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPeriodModal(b) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-text"
                      title={t('cardActions.addPeriod')}
                      aria-label={t('cardActions.addPeriodAria', { name: b.name })}
                    >
                      <Plus size={13} />
                    </button>
                  )}
                  {canManageAccounts && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(b) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-text"
                      title={t('cardActions.edit')}
                      aria-label={t('cardActions.editBudgetAria', { name: b.name })}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {/* Archived cards get the restore action; active cards
                      deliberately offer no archive button here. */}
                  {!b.is_active && canManageAccounts && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); unarchiveMutation.mutate(b.id) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-text"
                      title={t('cardActions.unarchive')}
                      aria-label={t('cardActions.unarchiveAria', { name: b.name })}
                    >
                      <Archive size={13} />
                    </button>
                  )}
                  {canManageAccounts && (
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleting(b) }}
                      className="flex items-center justify-center p-1.5 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] pointer-coarse:-my-3 text-text-muted hover:text-negative"
                      title={t('cardActions.delete')}
                      aria-label={t('cardActions.deleteBudgetAria', { name: b.name })}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </span>
              </div>
              <div className="mt-2 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                {b.cadence === 'weeks'
                  ? t('everyWeeks', { count: b.cadence_weeks })
                  : t(CADENCE_OPTIONS.find((o) => o.value === b.cadence)!.labelKey)}
              </div>
              {b.currency_codes.length > 0 && (
                <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  {formatCardCurrencyCodes(b.currency_codes)}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4">
        <label className="inline-flex items-center gap-2 text-xs text-text-muted cursor-pointer max-sm:min-h-[44px]">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t('showArchived')}
        </label>
      </div>

      <CreateBudgetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onManageCurrencies={canManageCurrencies ? openSettings : undefined}
      />
      {/* Mount-per-use (EditBudgetModal docblock): the conditional render is
          the open state; closing unmounts and the next open re-seeds. */}
      {editing && (
        <EditBudgetModal
          budget={editing}
          onClose={() => setEditing(null)}
          onManageCurrencies={canManageCurrencies ? openSettings : undefined}
        />
      )}
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
        title={t('deleteDialog.title')}
        message={t('deleteDialog.message', { name: deleting?.name })}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
        isPending={deleteMutation.isPending}
      />
      <WorkspaceSettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
