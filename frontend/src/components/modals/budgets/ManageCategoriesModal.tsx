import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Archive, Merge, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { budgetsApi, transactionsApi } from '../../../api/client'
import type { Category } from '../../../types'
import { useIsTouch } from '../../../hooks/useBreakpoint'
import { getApiErrorMessage } from '../../../utils/errors'
import { tappableProps } from '../../../utils/tappable'
import Modal from '../../common/Modal'
import Select from '../../common/Select'
import ActionSheet from '../../common/ActionSheet'
import ConfirmDialog from '../../common/ConfirmDialog'
import { controlHeightClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

interface Props {
  budgetId: number
  onClose: () => void
}

/**
 * Archive / merge / delete manager for a budget's categories (archive-first:
 * delete is offered only on already-archived rows). Mount-per-use: the
 * caller renders this component ONLY while it is open - the conditional
 * render IS the open/close mechanism, and the remount resets every
 * per-session state (merge target, pending dialogs) with zero open-effects.
 */
export default function ManageCategoriesModal({ budgetId, onClose }: Props) {
  const { t } = useTranslation('budgets')
  const queryClient = useQueryClient()
  const isTouch = useIsTouch()

  // Archived-inclusive list under its own key; the ['categories', budgetId]
  // prefix invalidation below covers both this [..., 'all'] key and the
  // page's active-only key.
  const { data: categories = [], isLoading, isError } = useQuery({
    queryKey: ['categories', budgetId, 'all'],
    queryFn: () => budgetsApi.listCategories(budgetId, true),
  })

  // Merge flow: the row's category is the SOURCE (deleted); the Select picks
  // the target that keeps the history. Target resets on every open.
  const [merging, setMerging] = useState<Category | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null)

  // Delete flow: the confirm states the live transaction count so "become
  // uncategorized" is an informed decision.
  const [deleting, setDeleting] = useState<Category | null>(null)
  const { data: countData } = useQuery({
    // Nested under the transactions family prefix so the shared
    // ['transactions'] invalidation refetches it with everything else.
    queryKey: ['transactions', 'count', deleting?.id],
    queryFn: () => transactionsApi.getAll({ category_id: [deleting!.id], page: 1, page_size: 1 }),
    enabled: !!deleting,
    staleTime: 30_000,
  })
  const deleteCount = countData?.total

  // Touch replacement for the hover-revealed row actions.
  const [rowAction, setRowAction] = useState<Category | null>(null)

  // A category state change ripples into the ledger, every category picker,
  // transaction/planned rows and reports - one shared invalidation set.
  const invalidateCategories = () => {
    queryClient.invalidateQueries({ queryKey: ['categories', budgetId] })
    queryClient.invalidateQueries({ queryKey: ['workspace-categories'] })
    queryClient.invalidateQueries({ queryKey: ['budget-summary', budgetId] })
    queryClient.invalidateQueries({ queryKey: ['budget-history', budgetId] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['planned'] })
  }

  // Reversible, so no confirm - same shape as the accounts archive.
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      budgetsApi.setCategoryArchive(budgetId, id, archived),
    onSuccess: (_category, { archived }) => {
      invalidateCategories()
      toast.success(archived ? t('manageCategories.categoryArchived') : t('manageCategories.categoryUnarchived'))
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('manageCategories.updateFailed'))),
  })

  const mergeMutation = useMutation({
    mutationFn: ({ targetId, sourceId }: { targetId: number; sourceId: number }) =>
      budgetsApi.mergeCategory(budgetId, targetId, sourceId),
    onSuccess: () => {
      invalidateCategories()
      toast.success(t('manageCategories.merged'))
      setMerging(null)
      setMergeTargetId(null)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, t('manageCategories.mergeFailed'))),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => budgetsApi.deleteCategory(budgetId, id),
    onSuccess: () => {
      invalidateCategories()
      toast.success(t('manageCategories.deleted'))
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, t('manageCategories.deleteFailed')))
      setDeleting(null)
    },
  })

  const active = categories.filter((c) => !c.is_archived)
  const archived = categories.filter((c) => c.is_archived)

  const openMerge = (category: Category) => {
    setMergeTargetId(null)
    setMerging(category)
  }

  const sectionHeaderClass = 'text-[9px] font-mono uppercase tracking-widest text-text-muted mb-2'

  const renderRow = (category: Category) => (
    <div
      key={category.id}
      {...(isTouch ? tappableProps(() => setRowAction(category)) : {})}
      className={`group flex items-center justify-between gap-2 px-3 ${controlHeightClass} ${
        isTouch ? 'active:bg-surface-hover transition-colors cursor-pointer' : ''
      }`}
    >
      <span className={`text-sm truncate ${category.is_archived ? 'text-text-muted' : 'font-medium text-text'}`}>
        {category.name}
      </span>
      <span className="flex items-center gap-2 flex-shrink-0">
        {category.is_archived && (
          <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted border border-border rounded-sm px-1.5 py-0.5">
            {t('manageCategories.archived')}
          </span>
        )}
        {/* Hover actions are pointer-fine only - row tap opens the sheet on
            touch (invisible opacity-0 buttons would still intercept taps). */}
        {!isTouch && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => archiveMutation.mutate({ id: category.id, archived: !category.is_archived })}
              title={category.is_archived ? t('manageCategories.unarchive') : t('manageCategories.archive')}
              aria-label={category.is_archived ? t('manageCategories.unarchiveAria', { name: category.name }) : t('manageCategories.archiveAria', { name: category.name })}
              className="text-text-muted hover:text-text p-1"
            >
              <Archive size={13} />
            </button>
            <button
              type="button"
              onClick={() => openMerge(category)}
              title={t('manageCategories.mergeInto')}
              aria-label={t('manageCategories.mergeAria', { name: category.name })}
              className="text-text-muted hover:text-text p-1"
            >
              <Merge size={13} />
            </button>
            {category.is_archived && (
              <button
                type="button"
                onClick={() => setDeleting(category)}
                title={t('manageCategories.delete')}
                aria-label={t('manageCategories.deleteAria', { name: category.name })}
                className="text-text-muted hover:text-negative p-1"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </span>
    </div>
  )

  return (
    <>
      <Modal open onClose={onClose} size="md" className="p-6 max-h-[90vh] overflow-y-auto" title={t('manageCategories.title')}>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 bg-surface-muted rounded-sm animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-text-muted">{t('manageCategories.loadFailed')}</p>
        ) : (
          <div className="space-y-4">
            <section aria-label={t('manageCategories.activeSectionAria')}>
              <h3 className={sectionHeaderClass}>{t('manageCategories.activeSection')}</h3>
              <div className="border border-border rounded-sm divide-y divide-border">
                {active.length > 0 ? (
                  active.map(renderRow)
                ) : (
                  <p className="px-3 py-3 text-sm text-text-muted">{t('manageCategories.noCategories')}</p>
                )}
              </div>
            </section>
            {archived.length > 0 && (
              <section aria-label={t('manageCategories.archivedSectionAria')}>
                <h3 className={sectionHeaderClass}>{t('manageCategories.archivedSection')}</h3>
                <div className="border border-border rounded-sm divide-y divide-border">
                  {archived.map(renderRow)}
                </div>
              </section>
            )}
          </div>
        )}
      </Modal>

      {/* Nested overlays render AFTER the outer modal so DOM order stacks
          them above it (both sit at z-modal) and Escape unwinds top-first. */}
      {merging && (
        <Modal open onClose={() => setMerging(null)} size="sm" className="p-6" title={t('manageCategories.mergeTitle', { name: merging.name })}>
          <p className="text-xs text-text-muted -mt-3 mb-4">
            {t('manageCategories.mergeBody', { name: merging.name })}
          </p>
          <div className="mb-4">
            <label className={labelClass}>{t('manageCategories.mergeTargetLabel')}</label>
            <Select
              value={mergeTargetId}
              onChange={setMergeTargetId}
              options={active
                .filter((c) => c.id !== merging.id)
                .map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t('manageCategories.selectCategoryPlaceholder')}
              aria-label={t('manageCategories.mergeTargetAria')}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMerging(null)} className={secondaryButtonClass}>
              {t('manageCategories.cancel')}
            </button>
            <button
              type="button"
              onClick={() => { if (mergeTargetId != null) mergeMutation.mutate({ targetId: mergeTargetId, sourceId: merging.id }) }}
              disabled={mergeTargetId == null || mergeMutation.isPending}
              className={primaryButtonClass}
            >
              {mergeMutation.isPending ? t('manageCategories.merging') : t('manageCategories.merge')}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deleting}
        title={t('manageCategories.deleteDialog.title')}
        message={deleteCount == null
          ? t('manageCategories.deleteDialog.countingMessage', { name: deleting?.name })
          : t('manageCategories.deleteDialog.message', { name: deleting?.name, count: deleteCount })}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
        isPending={deleteMutation.isPending}
      />

      <ActionSheet
        open={!!rowAction}
        onClose={() => setRowAction(null)}
        title={rowAction?.name}
        actions={rowAction ? [
          {
            label: rowAction.is_archived ? t('manageCategories.unarchive') : t('manageCategories.archive'),
            icon: Archive,
            onSelect: () => archiveMutation.mutate({ id: rowAction.id, archived: !rowAction.is_archived }),
          },
          { label: t('manageCategories.mergeInto'), icon: Merge, onSelect: () => openMerge(rowAction) },
          ...(rowAction.is_archived
            ? [{ label: t('manageCategories.delete'), icon: Trash2, destructive: true, onSelect: () => setDeleting(rowAction) }]
            : []),
        ] : []}
      />
    </>
  )
}
