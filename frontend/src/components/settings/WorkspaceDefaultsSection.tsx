import { useId, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import MultiSelect from '../common/MultiSelect'
import Select from '../common/Select'
import type { SelectOption } from '../common/Select'
import { labelClass, primaryButtonClass } from '../common/formStyles'
import { useUpdateWorkspaceSettings, useWorkspaceSettings } from '../../hooks/useWorkspaceSettings'
import { getApiErrorMessage } from '../../utils/errors'
import {
  normalizePlannedPage,
  normalizeTransactionsPage,
  normalizeTransfersPage,
  PAGE_BUILTIN_DEFAULTS,
} from '../../utils/pageDefaults'
import type { WorkspaceSettingsPatch } from '../../api/client'
import type {
  PlannedOrderingValue,
  PlannedStatusValue,
  PlannedViewValue,
  RangePreset,
  TransactionType,
  TransactionsOrderingValue,
  UserWorkspaceSettings,
} from '../../types'

// Sentinel for "no preference - the page uses its built-in default" in the
// single-selects. Select cannot hold null (a null value renders the muted
// placeholder, which is not a selectable option), so "Default" is a real
// FIRST option carrying this value. Entity-enum strings never contain the
// sentinel string, so it cannot collide (the numeric NO_ACCOUNT = 0 recipe
// adapted for string enums).
const NO_DEFAULT = '__default'

// Option arrays carry keys only: values are the wire enums and never
// translate; labels resolve through t() inside the component - the pages'
// own convention. These are local twins of the page arrays (Planned's
// STATUS_OPTIONS / SORT_OPTIONS / view tabs and Transactions' TYPE_OPTIONS /
// SORT_OPTIONS are module-level and not exported): same values, same
// labelKeys in the same namespaces, so this section's labels cannot drift
// from the pages'. If the pages ever export their arrays, import them
// instead of maintaining these twins.
const PLANNED_STATUS_KEYS = [
  { value: 'all', labelKey: 'status.all' },
  { value: 'pending', labelKey: 'status.pending' },
  { value: 'done', labelKey: 'status.done' },
  { value: 'cancelled', labelKey: 'status.cancelled' },
] as const

const PLANNED_VIEW_KEYS = [
  { value: 'planned', labelKey: 'recurring.tabPlanned' },
  { value: 'recurring', labelKey: 'recurring.tabRecurring' },
] as const

const PLANNED_ORDERING_KEYS = [
  { value: 'planned_date', labelKey: 'sort.soonest' },
  { value: '-planned_date', labelKey: 'sort.latest' },
  { value: '-amount', labelKey: 'sort.amountDesc' },
  { value: 'amount', labelKey: 'sort.amountAsc' },
  { value: 'name', labelKey: 'sort.name' },
] as const

const TX_TYPE_KEYS = [
  { value: 'income', labelKey: 'type.income' },
  { value: 'expense', labelKey: 'type.expense' },
  { value: 'adjustment', labelKey: 'type.adjustment' },
] as const

const TX_ORDERING_KEYS = [
  { value: '-date', labelKey: 'sort.newest' },
  { value: 'date', labelKey: 'sort.oldest' },
  { value: '-amount', labelKey: 'sort.amountDesc' },
  { value: 'amount', labelKey: 'sort.amountAsc' },
  { value: 'description', labelKey: 'sort.description' },
] as const

// The range facet has no page label source to mirror: no page offers a
// month/week/year/all picker (the list-filter chips are this-month /
// last-month / last-30 / this-year / all-time). These settings-namespace
// keys are the single label source for all three pages' range selects.
const RANGE_KEYS = [
  { value: 'month', labelKey: 'workspaceSettings.defaults.rangeMonth' },
  { value: 'week', labelKey: 'workspaceSettings.defaults.rangeWeek' },
  { value: 'year', labelKey: 'workspaceSettings.defaults.rangeYear' },
  { value: 'all', labelKey: 'workspaceSettings.defaults.rangeAll' },
] as const

// Dropdown state: every single-select facet is its wire union widened with
// the NO_DEFAULT sentinel (the draft KEEPS the sentinel; only serialization
// maps it to null). The type facet is a plain list - the empty selection IS
// the "no preference" state, because a fake "__default" option inside a
// MultiSelect would be selectable alongside real values.
interface DefaultsDraft {
  plannedStatus: PlannedStatusValue | typeof NO_DEFAULT
  plannedRange: RangePreset | typeof NO_DEFAULT
  plannedView: PlannedViewValue | typeof NO_DEFAULT
  plannedOrdering: PlannedOrderingValue | typeof NO_DEFAULT
  txRange: RangePreset | typeof NO_DEFAULT
  txType: TransactionType[]
  txOrdering: TransactionsOrderingValue | typeof NO_DEFAULT
  transfersRange: RangePreset | typeof NO_DEFAULT
}

// Draft -> PATCH shape. The sentinel maps back to null and an empty type
// list serializes as null; every page sub-object is always present (this UI
// owns all facets, and a present page key is a full replace on the wire).
function draftToPatch(draft: DefaultsDraft): WorkspaceSettingsPatch {
  return {
    planned: {
      status: draft.plannedStatus === NO_DEFAULT ? null : draft.plannedStatus,
      range: draft.plannedRange === NO_DEFAULT ? null : draft.plannedRange,
      view: draft.plannedView === NO_DEFAULT ? null : draft.plannedView,
      ordering: draft.plannedOrdering === NO_DEFAULT ? null : draft.plannedOrdering,
    },
    transactions: {
      range: draft.txRange === NO_DEFAULT ? null : draft.txRange,
      type: draft.txType.length === 0 ? null : draft.txType,
      ordering: draft.txOrdering === NO_DEFAULT ? null : draft.txOrdering,
    },
    transfers: { range: draft.transfersRange === NO_DEFAULT ? null : draft.transfersRange },
  }
}

// The saved side of the dirty check, through the same normalize functions
// the pages apply to the stored blob. Undefined data (query cold or
// errored) normalizes to all-null - which equals the all-sentinel seed, so
// a cold panel starts clean, not dirty.
function settingsToPatch(settings: UserWorkspaceSettings | undefined): WorkspaceSettingsPatch {
  return {
    planned: normalizePlannedPage(settings?.planned),
    transactions: normalizeTransactionsPage(settings?.transactions),
    transfers: normalizeTransfersPage(settings?.transfers),
  }
}

// Seed from (possibly undefined) settings: a null facet lands on the
// sentinel, a null type list on the empty selection.
function seedDraft(settings: UserWorkspaceSettings | undefined): DefaultsDraft {
  const planned = normalizePlannedPage(settings?.planned)
  const tx = normalizeTransactionsPage(settings?.transactions)
  const transfers = normalizeTransfersPage(settings?.transfers)
  return {
    plannedStatus: planned.status ?? NO_DEFAULT,
    plannedRange: planned.range ?? NO_DEFAULT,
    plannedView: planned.view ?? NO_DEFAULT,
    plannedOrdering: planned.ordering ?? NO_DEFAULT,
    txRange: tx.range ?? NO_DEFAULT,
    txType: tx.type ?? [],
    txOrdering: tx.ordering ?? NO_DEFAULT,
    transfersRange: transfers.range ?? NO_DEFAULT,
  }
}

// Dirty check with normalization on both sides: null and [] are the same
// "no type preference" (a stored explicit-empty must not read as dirty).
// Both patch shapes always carry all three sub-objects (see draftToPatch /
// settingsToPatch), so the optionality never materializes.
function typesEqual(a: TransactionType[] | null, b: TransactionType[] | null): boolean {
  const la = a ?? []
  const lb = b ?? []
  return la.length === lb.length && la.every((v, i) => v === lb[i])
}

function patchesEqual(a: WorkspaceSettingsPatch, b: WorkspaceSettingsPatch): boolean {
  const pa = a.planned!
  const pb = b.planned!
  const ta = a.transactions!
  const tb = b.transactions!
  return (
    pa.status === pb.status &&
    pa.range === pb.range &&
    pa.view === pb.view &&
    pa.ordering === pb.ordering &&
    ta.range === tb.range &&
    typesEqual(ta.type, tb.type) &&
    ta.ordering === tb.ordering &&
    a.transfers!.range === b.transfers!.range
  )
}

// Label key of one option value, looked up in the same key array that
// feeds the select - the "Default (...)" sentinel interpolates the
// built-in's translated name from HERE, never a re-typed copy (a second
// translation of the same name would drift under translation). The caller
// resolves the key through its own namespaced t(): the as-const labelKeys
// flow into t() as literal unions, the pages' own option-lookup shape.
function labelKeyFor<T extends string, K extends string>(
  keys: ReadonlyArray<{ readonly value: T; readonly labelKey: K }>,
  value: T,
): K {
  // Non-null: the built-ins and these arrays mirror the same wire enums -
  // the same sync assumption the pages' own option lookups make.
  return keys.find((o) => o.value === value)!.labelKey
}

/** Per-workspace default views for the settings panel: one Select per page
 *  facet (a MultiSelect for the transactions type filter), a shared Save
 *  button, and a PATCH that always sends all three page sub-objects.
 *  Renders for every role - these defaults are personal, not
 *  administrative, so there is no permission gate and no note. */
export default function WorkspaceDefaultsSection() {
  const { t } = useTranslation('settings')
  const { t: tPlanned } = useTranslation('planned')
  const { t: tTx } = useTranslation('transactions')
  const { data } = useWorkspaceSettings()
  const updateSettings = useUpdateWorkspaceSettings()
  const idBase = useId()

  // The section mounts with the panel body (Modal unmounts its children
  // when closed), so the lazy initializer IS the per-open seed. Unresolved
  // settings seed every facet to "Default"; the arrival adjust below fills
  // late-resolving settings. No open effect at all.
  const [draft, setDraft] = useState<DefaultsDraft>(() => seedDraft(data))
  const [seededFromData, setSeededFromData] = useState(data !== undefined)

  // Settings-data arrival: the query can resolve after the panel opened
  // (cold cache; staleTime makes this rare). Keyed on data presence, never
  // data identity - a refetch of already-arrived data re-seeds nothing -
  // and every facet is guarded by a still-at-seed check so in-progress
  // edits survive the fill. Setting the latch disproves the guard on the
  // immediate re-render, so the adjust terminates by construction.
  if (data !== undefined && !seededFromData) {
    setSeededFromData(true)
    const next = seedDraft(data)
    setDraft((prev) => ({
      ...prev,
      plannedStatus: prev.plannedStatus === NO_DEFAULT && next.plannedStatus !== NO_DEFAULT ? next.plannedStatus : prev.plannedStatus,
      plannedRange: prev.plannedRange === NO_DEFAULT && next.plannedRange !== NO_DEFAULT ? next.plannedRange : prev.plannedRange,
      plannedView: prev.plannedView === NO_DEFAULT && next.plannedView !== NO_DEFAULT ? next.plannedView : prev.plannedView,
      plannedOrdering: prev.plannedOrdering === NO_DEFAULT && next.plannedOrdering !== NO_DEFAULT ? next.plannedOrdering : prev.plannedOrdering,
      txRange: prev.txRange === NO_DEFAULT && next.txRange !== NO_DEFAULT ? next.txRange : prev.txRange,
      txType: prev.txType.length === 0 && next.txType.length > 0 ? next.txType : prev.txType,
      txOrdering: prev.txOrdering === NO_DEFAULT && next.txOrdering !== NO_DEFAULT ? next.txOrdering : prev.txOrdering,
      transfersRange: prev.transfersRange === NO_DEFAULT && next.transfersRange !== NO_DEFAULT ? next.transfersRange : prev.transfersRange,
    }))
  }

  // The "Default (...)" option label: one key per label shape, the built-in
  // name interpolated from the same translated source the pages use.
  const defaultOptionLabel = (builtIn: string) => t('workspaceSettings.defaults.defaultOption', { builtIn })

  // Option arrays: sentinel first, then the real values with labels from
  // the same labelKeys the pages use (planned / transactions namespaces);
  // range labels from the settings namespace (no page source exists).
  const plannedStatusOptions: SelectOption<PlannedStatusValue | typeof NO_DEFAULT>[] = [
    { value: NO_DEFAULT, label: defaultOptionLabel(tPlanned(labelKeyFor(PLANNED_STATUS_KEYS, PAGE_BUILTIN_DEFAULTS.planned.status))) },
    ...PLANNED_STATUS_KEYS.map((o) => ({ value: o.value, label: tPlanned(o.labelKey) })),
  ]
  const plannedRangeOptions: SelectOption<RangePreset | typeof NO_DEFAULT>[] = [
    { value: NO_DEFAULT, label: defaultOptionLabel(t(labelKeyFor(RANGE_KEYS, PAGE_BUILTIN_DEFAULTS.planned.range))) },
    ...RANGE_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
  ]
  const plannedViewOptions: SelectOption<PlannedViewValue | typeof NO_DEFAULT>[] = [
    { value: NO_DEFAULT, label: defaultOptionLabel(tPlanned(labelKeyFor(PLANNED_VIEW_KEYS, PAGE_BUILTIN_DEFAULTS.planned.view))) },
    ...PLANNED_VIEW_KEYS.map((o) => ({ value: o.value, label: tPlanned(o.labelKey) })),
  ]
  const plannedOrderingOptions: SelectOption<PlannedOrderingValue | typeof NO_DEFAULT>[] = [
    { value: NO_DEFAULT, label: defaultOptionLabel(tPlanned(labelKeyFor(PLANNED_ORDERING_KEYS, PAGE_BUILTIN_DEFAULTS.planned.ordering))) },
    ...PLANNED_ORDERING_KEYS.map((o) => ({ value: o.value, label: tPlanned(o.labelKey) })),
  ]
  const txRangeOptions: SelectOption<RangePreset | typeof NO_DEFAULT>[] = [
    { value: NO_DEFAULT, label: defaultOptionLabel(t(labelKeyFor(RANGE_KEYS, PAGE_BUILTIN_DEFAULTS.transactions.range))) },
    ...RANGE_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
  ]
  // No sentinel option here: the empty selection IS "no preference".
  const txTypeOptions = TX_TYPE_KEYS.map((o) => ({ value: o.value, label: tTx(o.labelKey) }))
  const txOrderingOptions: SelectOption<TransactionsOrderingValue | typeof NO_DEFAULT>[] = [
    { value: NO_DEFAULT, label: defaultOptionLabel(tTx(labelKeyFor(TX_ORDERING_KEYS, PAGE_BUILTIN_DEFAULTS.transactions.ordering))) },
    ...TX_ORDERING_KEYS.map((o) => ({ value: o.value, label: tTx(o.labelKey) })),
  ]
  const transfersRangeOptions: SelectOption<RangePreset | typeof NO_DEFAULT>[] = [
    { value: NO_DEFAULT, label: defaultOptionLabel(t(labelKeyFor(RANGE_KEYS, PAGE_BUILTIN_DEFAULTS.transfers.range))) },
    ...RANGE_KEYS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
  ]

  // Resolved in the body, not inside the JSX: the literal-string lint only
  // recognizes the unaliased t() callee, and the MultiSelect placeholder
  // interpolates the page's own "all types" wording (the same key the
  // page's type filter uses).
  const txTypePlaceholder = defaultOptionLabel(tTx('filters.allTypes'))

  const dirty = !patchesEqual(draftToPatch(draft), settingsToPatch(data))

  const handleSave = () => {
    // Full-blob PATCH (all three page sub-objects): this UI owns every
    // facet, and page-level replace semantics make the complete shape the
    // predictable payload. Success keeps the panel OPEN (only the toast
    // answers); the hook's invalidation refetches the blob, which turns
    // the dirty check false.
    updateSettings.mutate(draftToPatch(draft), {
      onSuccess: () => toast.success(t('workspaceSettings.defaults.savedToast')),
      onError: (error) => toast.error(getApiErrorMessage(error, t('workspaceSettings.defaults.saveFailed'))),
    })
  }

  return (
    <div className="border-t border-border pt-6">
      <h4 className="text-sm font-medium text-text mb-2">{t('workspaceSettings.defaults.title')}</h4>
      <div className="space-y-4">
        <div>
          <p className={labelClass}>{t('workspaceSettings.defaults.plannedGroup')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${idBase}-planned-status`} className={labelClass}>
                {t('workspaceSettings.defaults.plannedStatus')}
              </label>
              <Select
                id={`${idBase}-planned-status`}
                value={draft.plannedStatus}
                onChange={(v) => setDraft((prev) => ({ ...prev, plannedStatus: v }))}
                options={plannedStatusOptions}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-planned-range`} className={labelClass}>
                {t('workspaceSettings.defaults.plannedRange')}
              </label>
              <Select
                id={`${idBase}-planned-range`}
                value={draft.plannedRange}
                onChange={(v) => setDraft((prev) => ({ ...prev, plannedRange: v }))}
                options={plannedRangeOptions}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-planned-view`} className={labelClass}>
                {t('workspaceSettings.defaults.plannedView')}
              </label>
              <Select
                id={`${idBase}-planned-view`}
                value={draft.plannedView}
                onChange={(v) => setDraft((prev) => ({ ...prev, plannedView: v }))}
                options={plannedViewOptions}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-planned-ordering`} className={labelClass}>
                {t('workspaceSettings.defaults.plannedOrdering')}
              </label>
              <Select
                id={`${idBase}-planned-ordering`}
                value={draft.plannedOrdering}
                onChange={(v) => setDraft((prev) => ({ ...prev, plannedOrdering: v }))}
                options={plannedOrderingOptions}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div>
          <p className={labelClass}>{t('workspaceSettings.defaults.transactionsGroup')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${idBase}-tx-range`} className={labelClass}>
                {t('workspaceSettings.defaults.txRange')}
              </label>
              <Select
                id={`${idBase}-tx-range`}
                value={draft.txRange}
                onChange={(v) => setDraft((prev) => ({ ...prev, txRange: v }))}
                options={txRangeOptions}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-tx-type`} className={labelClass}>
                {t('workspaceSettings.defaults.txType')}
              </label>
              <MultiSelect
                id={`${idBase}-tx-type`}
                values={draft.txType}
                onChange={(v) => setDraft((prev) => ({ ...prev, txType: v }))}
                options={txTypeOptions}
                placeholder={txTypePlaceholder}
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-tx-ordering`} className={labelClass}>
                {t('workspaceSettings.defaults.txOrdering')}
              </label>
              <Select
                id={`${idBase}-tx-ordering`}
                value={draft.txOrdering}
                onChange={(v) => setDraft((prev) => ({ ...prev, txOrdering: v }))}
                options={txOrderingOptions}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div>
          <p className={labelClass}>{t('workspaceSettings.defaults.transfersGroup')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`${idBase}-transfers-range`} className={labelClass}>
                {t('workspaceSettings.defaults.transfersRange')}
              </label>
              <Select
                id={`${idBase}-transfers-range`}
                value={draft.transfersRange}
                onChange={(v) => setDraft((prev) => ({ ...prev, transfersRange: v }))}
                options={transfersRangeOptions}
                className="w-full"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || updateSettings.isPending}
            className={primaryButtonClass}
          >
            {updateSettings.isPending ? t('workspaceSettings.saving') : t('workspaceSettings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
