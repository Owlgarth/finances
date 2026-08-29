import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Archive, Merge, Trash2 } from 'lucide-react'
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
      toast.success(archived ? 'Category archived' : 'Category unarchived')
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to update category')),
  })

  const mergeMutation = useMutation({
    mutationFn: ({ targetId, sourceId }: { targetId: number; sourceId: number }) =>
      budgetsApi.mergeCategory(budgetId, targetId, sourceId),
    onSuccess: () => {
      invalidateCategories()
      toast.success('Categories merged')
      setMerging(null)
      setMergeTargetId(null)
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Failed to merge categories')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => budgetsApi.deleteCategory(budgetId, id),
    onSuccess: () => {
      invalidateCategories()
      toast.success('Category deleted')
      setDeleting(null)
    },
    onError: (error) => {
      toast.error(getApiErrorMessage(error, 'Failed to delete category'))
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
            Archived
          </span>
        )}
        {/* Hover actions are pointer-fine only - row tap opens the sheet on
            touch (invisible opacity-0 buttons would still intercept taps). */}
        {!isTouch && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => archiveMutation.mutate({ id: category.id, archived: !category.is_archived })}
              title={category.is_archived ? 'Unarchive' : 'Archive'}
              aria-label={category.is_archived ? `Unarchive ${category.name}` : `Archive ${category.name}`}
              className="text-text-muted hover:text-text p-1"
            >
              <Archive size={13} />
            </button>
            <button
              type="button"
              onClick={() => openMerge(category)}
              title="Merge into…"
              aria-label={`Merge ${category.name} into another category`}
              className="text-text-muted hover:text-text p-1"
            >
              <Merge size={13} />
            </button>
            {category.is_archived && (
              <button
                type="button"
                onClick={() => setDeleting(category)}
                title="Delete"
                aria-label={`Delete ${category.name}`}
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
      <Modal open onClose={onClose} size="md" className="p-6 max-h-[90vh] overflow-y-auto" title="Manage categories">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 bg-surface-muted rounded-sm animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-text-muted">Failed to load categories. Close and reopen to retry.</p>
        ) : (
          <div className="space-y-4">
            <section aria-label="Active categories">
              <h3 className={sectionHeaderClass}>Active</h3>
              <div className="border border-border rounded-sm divide-y divide-border">
                {active.length > 0 ? (
                  active.map(renderRow)
                ) : (
                  <p className="px-3 py-3 text-sm text-text-muted">No categories yet.</p>
                )}
              </div>
            </section>
            {archived.length > 0 && (
              <section aria-label="Archived categories">
                <h3 className={sectionHeaderClass}>Archived</h3>
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
        <Modal open onClose={() => setMerging(null)} size="sm" className="p-6" title={`Merge “${merging.name}” into…`}>
          <p className="text-xs text-text-muted -mt-3 mb-4">
            All transactions, planned transactions and planned amounts of “{merging.name}” will
            move to the category you pick, and “{merging.name}” will be deleted. Planned amounts
            for the same period are added together. This cannot be undone.
          </p>
          <div className="mb-4">
            <label className={labelClass}>Merge into</label>
            <Select
              value={mergeTargetId}
              onChange={setMergeTargetId}
              options={active
                .filter((c) => c.id !== merging.id)
                .map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Select category"
              aria-label="Merge into category"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMerging(null)} className={secondaryButtonClass}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { if (mergeTargetId != null) mergeMutation.mutate({ targetId: mergeTargetId, sourceId: merging.id }) }}
              disabled={mergeTargetId == null || mergeMutation.isPending}
              className={primaryButtonClass}
            >
              {mergeMutation.isPending ? 'Merging…' : 'Merge'}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={!!deleting}
        title="Delete category"
        message={`Delete "${deleting?.name}"? ${deleteCount ?? 'Counting...'} transactions will become uncategorized. This cannot be undone.`}
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
            label: rowAction.is_archived ? 'Unarchive' : 'Archive',
            icon: Archive,
            onSelect: () => archiveMutation.mutate({ id: rowAction.id, archived: !rowAction.is_archived }),
          },
          { label: 'Merge into…', icon: Merge, onSelect: () => openMerge(rowAction) },
          ...(rowAction.is_archived
            ? [{ label: 'Delete', icon: Trash2, destructive: true, onSelect: () => setDeleting(rowAction) }]
            : []),
        ] : []}
      />
    </>
  )
}
