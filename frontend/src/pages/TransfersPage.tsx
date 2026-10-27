import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeftRight, Pencil, Plus, Repeat, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { transfersApi } from '../api/client'
import type { Transfer, UserWorkspaceSettings } from '../types'
import { useAccounts } from '../hooks/useDomain'
import { usePermissions } from '../hooks/usePermissions'
import { useUserPreferences } from '../contexts/UserPreferencesContext'
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from '../hooks/useWorkspaceSettings'
import { formatAmount } from '../utils/format'
import { getApiErrorMessage } from '../utils/errors'
import { getStoredPageSize, setStoredPageSize } from '../utils/pageSize'
import { createUpdateParams, intParam, useStalePageReset } from '../utils/params'
import { buildDefaultsLatch, capturePageDefaults } from '../utils/pageDefaults'
import { useIsTouch } from '../hooks/useBreakpoint'
import { tappableProps } from '../utils/tappable'
import ActionSheet from '../components/common/ActionSheet'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EmptyState from '../components/common/EmptyState'
import Pagination from '../components/common/Pagination'
import Select from '../components/common/Select'
import TransferModal from '../components/accounts/TransferModal'
import { FilterPanel, FilterField } from '../components/common/FilterBar'
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../components/common/formStyles'

// Arrival gate + page shell. The per-page defaults must resolve before the
// content mounts: a cold-cache materialization of built-ins would flip every
// control a moment later. Both gate queries are boot-time fetches with a
// staleTime, so warm by the time users reach the page - the gate binds on
// cold cache and workspace switch only. An errored settings query opens the
// gate with settings undefined and the content degrades to the page
// built-ins (pageDefaults normalizes undefined to all-null) rather than
// blocking the page.
export default function TransfersPage() {
  const { t } = useTranslation('transfers')
  const [searchParams] = useSearchParams()
  const { canWrite } = usePermissions()
  const { data: settings, isLoading: settingsLoading } = useWorkspaceSettings()
  const { isLoading: preferencesLoading, calendarStartDay } = useUserPreferences()
  const defaultsLoading = settingsLoading || preferencesLoading

  // Skeleton delay: a skeleton flashing for a fast cache hit is its own
  // banned pattern, so the pulse shows only after the load has visibly
  // stalled. The setter lives ONLY inside the timer callback (a synchronous
  // set in the effect body would trip set-state-in-effect); the reset when
  // the gate reopens is the fall-through adjust below.
  const [skeletonShown, setSkeletonShown] = useState(false)
  useEffect(() => {
    if (!defaultsLoading) return
    const timer = setTimeout(() => setSkeletonShown(true), 300)
    return () => clearTimeout(timer)
  }, [defaultsLoading])

  // Header New click crosses the component boundary: the button lives here
  // (above the gate) while the form modal and its seed state live in the
  // content. A plain counter the content consumes with a render-adjust.
  const [createRequest, setCreateRequest] = useState(0)

  // Fall-through reset of the skeleton flag (lands on false, which disproves
  // its own guard - terminates by construction; StrictMode-idempotent).
  if (!defaultsLoading && skeletonShown) setSkeletonShown(false)

  // Save the current view facets as this page's defaults. This page has no
  // control row (no bookmark/search/sort actions), so the header action
  // group is where the secondary action lives - LEFT of the primary, where
  // secondary actions sit in a page-header action row. The capture helper
  // reads the URL at click time: the URL is the source of truth once the
  // default has materialized into it. Tradeoff: a click inside the brief
  // cold-cache gate window captures the pre-materialization URL (range
  // 'all') - a benign degradation; every click after materialization
  // matches the on-screen view. Toasts are per-call callbacks: the shared
  // hook owns only the cache invalidation.
  const updateSettings = useUpdateWorkspaceSettings()
  const handleSaveDefaults = () => {
    updateSettings.mutate(
      { transfers: capturePageDefaults(searchParams, 'transfers', calendarStartDay) },
      {
        onSuccess: () => toast.success(t('saveDefaultsSuccess')),
        onError: (error) => toast.error(getApiErrorMessage(error, t('saveDefaultsFailed'))),
      },
    )
  }

  return (
    <div className="p-6 max-sm:p-0 max-w-5xl mx-auto">
      {/* The h1 and the action row stay mounted through the gate: route
          changes move focus to the page h1, and a header that pops in
          after the gate is churn. The gated region is everything below. */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text">{t('title')}</h1>
        <div className="flex items-center gap-2">
          {/* Save the current view facets as this page's defaults.
              Secondary actions sit left of the primary in a page-header
              action row. Visible on mobile too: a preference action with
              no FAB twin - on mobile it becomes this group's only member,
              which is fine. NOT gated on canWrite: defaults are per-user,
              every role saves them. */}
          <button
            type="button"
            onClick={handleSaveDefaults}
            disabled={updateSettings.isPending}
            className={secondaryButtonClass}
          >
            <Save size={13} className="inline mr-1" /> {updateSettings.isPending ? t('saveDefaultsPending') : t('saveDefaults')}
          </button>
          {/* Hidden on mobile: the FAB quick-add has Transfer. */}
          {canWrite && (
            <button type="button" onClick={() => setCreateRequest((n) => n + 1)} className={`${primaryButtonClass} max-sm:hidden`}>
              <Plus size={13} className="inline mr-1" /> {t('actions.newTransfer')}
            </button>
          )}
        </div>
      </div>

      {defaultsLoading ? (
        // Under the 300ms threshold the gated region simply holds - a blank
        // beat is imperceptible, a skeleton flash is the anti-pattern. The
        // skeleton shapes approximate the always-visible FilterPanel (the
        // bordered account + date-pair panel) plus this page's own
        // list-row idiom - the same row height as the list skeleton below.
        skeletonShown ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-24 bg-surface-muted rounded-sm animate-pulse" />
            <div className="space-y-2 pt-1">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}
            </div>
          </div>
        ) : null
      ) : (
        <TransfersContent settings={settings} calendarStartDay={calendarStartDay} createRequest={createRequest} />
      )}
    </div>
  )
}

interface TransfersContentProps {
  /** Member-settings blob resolved by the arrival gate; undefined only when
      the settings query errored (built-ins apply). */
  settings: UserWorkspaceSettings | undefined
  /** Calendar start day (1 = Monday .. 7 = Sunday) for the week default. */
  calendarStartDay: number
  /** Bumps on every header New click; consumed by a render-adjust. */
  createRequest: number
}

function TransfersContent({ settings, calendarStartDay, createRequest }: TransfersContentProps) {
  const { t } = useTranslation('transfers')
  const queryClient = useQueryClient()
  const { canWrite } = usePermissions()
  const isTouch = useIsTouch()
  const { data: accounts = [] } = useAccounts(false)

  // Filter state lives in the URL (shareable, back-button friendly); any
  // filter change resets pagination via createUpdateParams.
  const [searchParams, setSearchParams] = useSearchParams()
  const account = intParam(searchParams, 'account')
  const rawFrom = searchParams.get('from')
  const rawTo = searchParams.get('to')
  const page = intParam(searchParams, 'page') ?? 1
  const updateParams = createUpdateParams(setSearchParams)

  // Session defaults, restoredSearch pattern generalized to the one facet
  // this page can default (range): the lazy initializer computes the latch
  // ONCE from the resolved settings and the mount-time URL (the latch
  // builder is pure) - a mount WITH either date param never defaults the
  // range (a partial date deep link kills only the latch; the missing
  // bound is never auto-filled). Range is null in the latch when either
  // date param is present or when the resolved preset is 'all' - null
  // means "write nothing", so a fresh all-null blob (range 'all') latches
  // nothing and this page behaves exactly as before the feature.
  // Consumed - never re-applies - once either date param has been present
  // (see the adjust below); a fresh mount re-initializes (accepted).
  const [defaultsLatch, setDefaultsLatch] = useState(() =>
    buildDefaultsLatch(settings, 'transfers', searchParams, calendarStartDay),
  )

  // Consume adjust - a fall-through render-adjust on local state (the
  // sanctioned shape; never an effect, never router state). The
  // materialization write below lands the range at once; the FUNCTIONAL
  // updater is load-bearing for the siblings' multi-facet case and keeps
  // this page's shape identical to theirs. The updater lands on a value
  // that disproves its own guard - the adjust terminates by construction;
  // hooks below stay unconditional; on the pass where it fires the params
  // already win the derivations, so no query key churns.
  if (defaultsLatch.range && (rawFrom !== null || rawTo !== null)) setDefaultsLatch((l) => ({ ...l, range: null }))

  // Effective range - all reads below (list query, filter badge, empty
  // state) use the EFFECTIVE range: explicit params win; both absent falls
  // back to the still-live default (the same value the materialization
  // effect below is about to write into the URL); a PARTIAL range (one
  // bound) passes through as-is - the missing bound is never auto-filled.
  const dateFrom = rawFrom ?? defaultsLatch.range?.from ?? ''
  const dateTo = rawTo ?? defaultsLatch.range?.to ?? ''

  const [pageSize, setPageSize] = useState(getStoredPageSize)

  // Default-derived from/to count exactly as user-set ones: a materialized
  // default range IS an active filter, so the FilterPanel's Clear link
  // appearing on fresh entry with a defaulted range is honest - the user
  // can see and clear what is filtering the list. The date inputs read
  // these same effective values, so the panel never shows a range the
  // list is not filtered by.
  const hasFilters = account != null || Boolean(dateFrom || dateTo)

  // One-shot defaults materialization (useStalePageReset shape: the URL
  // write goes through the closure-wrapped updateParams, never the raw
  // router setter - the shipped precedent for a no-event URL write from
  // an effect; a render-adjust must not write router state).
  // Fires only while the range latch is live: entering with both date
  // params absent writes the resolved default into the URL (replace, no
  // history entry). The write touches ONLY the defaultable param family
  // (from/to) plus createUpdateParams's automatic ?page drop - never the
  // account FilterPanel field. The consume adjust above then kills the
  // latch, so Clear / deep links never re-default within a session; a
  // fresh mount re-initializes the latch (accepted).
  useEffect(() => {
    if (!defaultsLatch.range) return
    updateParams({ from: defaultsLatch.range.from, to: defaultsLatch.range.to })
  }, [defaultsLatch, updateParams])

  const { data, isLoading } = useQuery({
    queryKey: ['transfers', page, pageSize, account, dateFrom, dateTo],
    queryFn: () =>
      transfersApi.getAll({
        page,
        page_size: pageSize,
        // v1 filter: ONE account id (either side of the transfer) - never an array.
        account_id: account ?? undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    // Previous page stays rendered while the next one loads - no skeleton
    // flash on page/filter changes (v5 placeholderData pattern).
    placeholderData: keepPreviousData,
  })

  // A stale ?page= beyond the (possibly shrunken) range resets to page 1 once
  // the response lands; the backend serves the clamped page meanwhile.
  useStalePageReset(page, data, updateParams)

  const [transferOpen, setTransferOpen] = useState(false)
  const [repeatTransfer, setRepeatTransfer] = useState<Transfer | null>(null)
  // Edit prefill is fetched, not taken from the row, so the modal always
  // saves against server truth. Keyed INSIDE the ['transfers'] family so the
  // modal's own save invalidations refetch it (a sibling key would serve a
  // stale row within staleTime after an edit).
  const [editingId, setEditingId] = useState<number | null>(null)
  const { data: editData } = useQuery({
    queryKey: ['transfers', 'detail', editingId],
    queryFn: () => transfersApi.get(editingId!),
    enabled: editingId != null,
  })
  // Touch replacement for the desktop hover actions.
  const [rowAction, setRowAction] = useState<Transfer | null>(null)
  const [deleting, setDeleting] = useState<Transfer | null>(null)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => transfersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['current-balances'] })
      queryClient.invalidateQueries({ queryKey: ['account-balance'] })
      toast.success(t('toast.deleted'))
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('toast.deleteFailed')))
      setDeleting(null)
    },
  })

  const openCreate = () => { setRepeatTransfer(null); setTransferOpen(true) }
  // Parameter is `transfer`, not `t`, so the translation function stays
  // reachable inside this helper.
  const openRepeat = (transfer: Transfer) => { setRepeatTransfer(transfer); setTransferOpen(true) }

  // Clears URL params only - saved defaults (if any) are untouched: the
  // next fresh entry re-materializes them. Clearing is the user's explicit
  // all-time choice for THIS session (the latch is consumed).
  const clearFilters = () => updateParams({ account: null, from: null, to: null })

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const items = data?.items ?? []

  // Header New click, consumed: the counter lives in the gate wrapper (the
  // button is above the gate, the modal state is here). A click inside the
  // cold-cache gate window lands after materialization, against the
  // post-defaults view. The latch catches up to the counter on the very
  // next pass: the adjust terminates by construction and is
  // StrictMode-idempotent.
  const [consumedCreateRequest, setConsumedCreateRequest] = useState(createRequest)
  if (createRequest !== consumedCreateRequest) {
    setConsumedCreateRequest(createRequest)
    openCreate()
  }

  return (
    <>
      {/* Always visible: three controls don't justify a collapsible panel. */}
      <FilterPanel onClear={hasFilters ? clearFilters : null}>
        <FilterField label={t('filters.accountLabel')}>
          <Select
            value={account}
            onChange={(v) => updateParams({ account: v })}
            options={accountOptions}
            placeholder={t('filters.allAccounts')}
            aria-label={t('filters.filterByAccountAria')}
            className="w-full"
          />
        </FilterField>
        <FilterField label={t('filters.dateLabel')} className="col-span-2">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => updateParams({ from: e.target.value || null })}
              aria-label={t('filters.fromDateAria')}
              className={`${inputClass} max-sm:min-h-[44px]`}
            />
            <span className="text-text-muted text-xs">-</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => updateParams({ to: e.target.value || null })}
              aria-label={t('filters.toDateAria')}
              className={`${inputClass} max-sm:min-h-[44px]`}
            />
          </div>
        </FilterField>
      </FilterPanel>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-muted rounded-sm animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        hasFilters ? (
          <p className="text-sm text-text-muted">{t('noMatch')}</p>
        ) : (
          <EmptyState
            icon={<ArrowLeftRight size={48} strokeWidth={1.5} className="text-text-muted/30" />}
            heading={t('emptyHeading')}
            message={t('emptyMessage')}
          />
        )
      ) : (
        <div className="border border-border rounded-sm bg-surface divide-y divide-border">
          {items.map((row) => (
            <div
              key={row.id}
              {...(isTouch && canWrite ? tappableProps(() => setRowAction(row)) : {})}
              className={`flex items-center justify-between px-4 py-2.5 text-sm group ${
                isTouch && canWrite ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-text truncate">
                  {row.from_account_name} → {row.to_account_name}
                  {row.description && <span className="text-text-muted"> · {row.description}</span>}
                </div>
                <div className="text-[10px] font-mono text-text-muted">{row.date}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 pl-3">
                {/* Cross-currency: second small line instead of one long string
                    that would overflow 375px. */}
                <span className="font-mono text-text text-right">
                  <span className="whitespace-nowrap">{formatAmount(row.from_amount)} {row.from_currency_code}</span>
                  {row.from_currency_code !== row.to_currency_code && (
                    <span className="block text-[10px] text-text-muted whitespace-nowrap">
                      → {formatAmount(row.to_amount)} {row.to_currency_code}
                    </span>
                  )}
                </span>
                {/* Hover reveals are pointer-fine only - on touch they'd be
                    invisible tap targets; the row tap opens the sheet instead. */}
                {canWrite && !isTouch && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => setEditingId(row.id)} title={t('row.edit')} aria-label={t('row.editAria')} className="text-text-muted hover:text-text p-1"><Pencil size={13} /></button>
                    <button type="button" onClick={() => openRepeat(row)} title={t('row.repeat')} aria-label={t('row.repeatAria')} className="text-text-muted hover:text-text p-1"><Repeat size={13} /></button>
                    <button type="button" onClick={() => setDeleting(row)} title={t('row.delete')} aria-label={t('row.deleteAria')} className="text-text-muted hover:text-negative p-1"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.total > 0 && (
        <div className="mt-4">
          <Pagination
            page={data.page}
            total_pages={data.total_pages}
            total={data.total}
            page_size={data.page_size}
            onPageChange={(p) => updateParams({ page: p })}
            onPageSizeChange={(s) => { setPageSize(s); setStoredPageSize(s); updateParams({ page: null }) }}
          />
        </div>
      )}

      <ActionSheet
        open={!!rowAction}
        onClose={() => setRowAction(null)}
        title={rowAction ? `${rowAction.from_account_name} → ${rowAction.to_account_name}` : undefined}
        actions={[
          { label: t('row.edit'), icon: Pencil, onSelect: () => rowAction && setEditingId(rowAction.id) },
          { label: t('row.repeat'), icon: Repeat, onSelect: () => rowAction && openRepeat(rowAction) },
          { label: t('row.delete'), icon: Trash2, destructive: true, onSelect: () => rowAction && setDeleting(rowAction) },
        ]}
      />
      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} repeatFrom={repeatTransfer} />
      {/* Edit modal (mount-per-use): mounts only once the prefetched transfer
          is loaded, so the form never opens against stale/missing data. */}
      {editingId != null && editData && (
        <TransferModal open onClose={() => setEditingId(null)} editFrom={editData} />
      )}
      <ConfirmDialog
        isOpen={!!deleting}
        title={t('confirmDelete.title')}
        message={t('confirmDelete.message', {
          from: deleting?.from_account_name ?? '',
          to: deleting?.to_account_name ?? '',
        })}
        isPending={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
