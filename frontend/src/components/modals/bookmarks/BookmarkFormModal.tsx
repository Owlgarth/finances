import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, Bookmark as BookmarkIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../../common/Modal'
import { useCreateBookmark, useUpdateBookmark } from '../../../hooks/useBookmarks'
import {
  BOOKMARK_COLOR_KEYS,
  BOOKMARK_ICONS,
  BOOKMARK_ICON_KEYS,
  BookmarkGlyph,
  bookmarkColorVar,
} from '../../bookmarks/bookmarkMeta'
import { countActiveFilters } from '../../../utils/bookmarks'
import type { Bookmark } from '../../../types'
import { getApiErrorMessage } from '../../../utils/errors'
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'

interface BookmarkFormModalProps {
  // Create: exactly one of budgetContext / pageContext set. Edit: bookmark set.
  budgetContext?: { budgetId: number; budgetName: string; currencyCode: string } | null
  pageContext?: { kind: 'transactions' | 'planned'; params: Record<string, string> } | null
  // Edit source; null in create mode. The target (budget/currency or params)
  // is immutable after create - edit changes name/icon/color only.
  bookmark?: Bookmark | null
  onClose: () => void
}

/** Currency chip class, shared by the preview row and the budget summary
 *  line (mono code only - never an amount). */
const chipClass =
  'inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none'

/**
 * Roving radiogroup navigation (WAI-ARIA radio pattern, simplified to the
 * currency-strip idiom in BudgetDetailPage): arrows select the next/previous
 * cell AND move focus to it (wrapping), Home/End jump to the ends. The
 * keydown lives on the radiogroup container; the cells are plain buttons
 * whose native click, Enter and Space keep working. Focus and selection
 * never diverge - the arrows set both, and the only other selection path is
 * a cell's own click (which focuses that cell natively) - so deriving the
 * index from the selected value is always correct.
 */
function radioGroupKeyDown(
  e: KeyboardEvent<HTMLDivElement>,
  keys: readonly string[],
  value: string,
  onSelect: (key: string) => void,
  cellRefs: RefObject<(HTMLButtonElement | null)[]>,
): void {
  const len = keys.length
  let next: number
  if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = len - 1
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (keys.indexOf(value) - 1 + len) % len
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (keys.indexOf(value) + 1) % len
  else return
  e.preventDefault()
  onSelect(keys[next])
  cellRefs.current[next]?.focus()
}

/**
 * Shared create/edit form for personal bookmarks. Mount-per-use modal shape:
 * fields seed from the props in the useState initializers, so the caller must
 * render this component ONLY while the form is open (unmount on close;
 * list-page callers add a per-session key) - that remount is what re-seeds
 * state for the next session, with zero open-effects.
 */
export default function BookmarkFormModal({ budgetContext, pageContext, bookmark, onClose }: BookmarkFormModalProps) {
  const { t } = useTranslation('bookmarks')
  const isEdit = !!bookmark

  // Prefill via lazy initializers, not open-effects (see docblock). Create
  // prefill: the budget's name, else the page's localized name; edit prefill:
  // the bookmark's own name. Unknown stored icon/color keys (e.g. an import
  // from a different palette) clamp to the registry defaults - the pickers
  // only offer registry keys, and BookmarkGlyph owns the render fallback.
  const [name, setName] = useState(() => {
    if (isEdit) return bookmark!.name
    if (budgetContext) return budgetContext.budgetName
    // Props contract: create mode sets exactly one context.
    return t(`pageName.${pageContext!.kind}`)
  })
  const [icon, setIcon] = useState(() => {
    const initial = bookmark?.icon ?? 'bookmark'
    return BOOKMARK_ICON_KEYS.includes(initial) ? initial : 'bookmark'
  })
  const [color, setColor] = useState(() => {
    const initial = bookmark?.color ?? BOOKMARK_COLOR_KEYS[0]
    return BOOKMARK_COLOR_KEYS.includes(initial) ? initial : BOOKMARK_COLOR_KEYS[0]
  })
  // Field-level required error (shown under the input); cleared on typing.
  const [nameError, setNameError] = useState(false)

  const createMutation = useCreateBookmark()
  const updateMutation = useUpdateBookmark()
  const pending = createMutation.isPending || updateMutation.isPending

  const iconCellRefs = useRef<(HTMLButtonElement | null)[]>([])
  const colorCellRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Read-only target summary inputs. Create: from the context props; edit:
  // from the bookmark row (the target is immutable after create).
  const targetCurrency = isEdit ? bookmark!.currency_code : budgetContext?.currencyCode ?? null
  const targetBudgetName = isEdit ? bookmark!.budget_name : budgetContext?.budgetName ?? null
  const targetPageKind = isEdit
    ? bookmark!.kind === 'budget'
      ? null
      : bookmark!.kind
    : pageContext?.kind ?? null
  const targetParams = isEdit ? bookmark!.params : pageContext?.params ?? null
  const filterCount = targetParams ? countActiveFilters(targetParams) : 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError(true)
      return
    }
    // Toasts + close live here (the data hooks own only cache invalidation):
    // per-call callbacks, so the success/error copy sits with the component
    // that owns the namespace. The backend's case-insensitive duplicate-name
    // 400 arrives as a translated detail via getApiErrorMessage.
    if (isEdit) {
      updateMutation.mutate(
        { id: bookmark!.id, data: { name: name.trim(), icon, color } },
        {
          onSuccess: () => {
            toast.success(t('updated'))
            onClose()
          },
          onError: (error) => toast.error(getApiErrorMessage(error, t('updateFailed'))),
        },
      )
    } else if (budgetContext) {
      createMutation.mutate(
        {
          kind: 'budget',
          name: name.trim(),
          icon,
          color,
          budget_id: budgetContext.budgetId,
          currency_code: budgetContext.currencyCode,
        },
        {
          onSuccess: () => {
            toast.success(t('created'))
            onClose()
          },
          onError: (error) => toast.error(getApiErrorMessage(error, t('createFailed'))),
        },
      )
    } else if (pageContext) {
      createMutation.mutate(
        { kind: pageContext.kind, name: name.trim(), icon, color, params: pageContext.params },
        {
          onSuccess: () => {
            toast.success(t('created'))
            onClose()
          },
          onError: (error) => toast.error(getApiErrorMessage(error, t('createFailed'))),
        },
      )
    }
  }

  return (
    // size="md" - sm is reserved for confirms/prompts; `open` hardcoded:
    // mount-per-use, the caller's conditional render IS the open state.
    <Modal open onClose={onClose} size="md" className="p-6" title={isEdit ? t('editTitle') : t('addTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name. maxLength mirrors the backend's 100-char cap. */}
        <div>
          <label htmlFor="bookmark-name" className={labelClass}>{t('nameLabel')}</label>
          <input
            id="bookmark-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError) setNameError(false)
            }}
            maxLength={100}
            className={nameError ? `${inputClass} bg-negative-bg border-negative ring-1 ring-negative` : inputClass}
          />
          {nameError && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-negative font-medium">
              <AlertCircle size={12} className="shrink-0" />
              <span>{t('nameRequired')}</span>
            </div>
          )}
        </div>

        {/* Icon picker: 16 registry keys, grid-cols-8 (2 rows) collapsing to
            4 columns on mobile so 44px coarse-pointer cells fit. */}
        <div>
          <label className={labelClass}>{t('iconLabel')}</label>
          <div
            role="radiogroup"
            aria-label={t('iconLabel')}
            onKeyDown={(e) => radioGroupKeyDown(e, BOOKMARK_ICON_KEYS, icon, setIcon, iconCellRefs)}
            className="grid grid-cols-8 gap-1 max-sm:grid-cols-4"
          >
            {BOOKMARK_ICON_KEYS.map((key, i) => {
              // Inline member-expression lookup (a call-assigned capitalized
              // identifier reads as a component created during render to the
              // react-hooks lint; indexing the map is the sanctioned shape).
              const CellIcon = (key !== null && BOOKMARK_ICONS[key]) || BookmarkIcon
              const isSelected = key === icon
              return (
                <button
                  key={key}
                  ref={(el) => { iconCellRefs.current[i] = el }}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  aria-label={t(`icons.${key}`, { defaultValue: key })}
                  onClick={() => setIcon(key)}
                  className={`h-8 rounded-none flex items-center justify-center border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] ${
                    isSelected
                      ? 'border-primary ring-1 ring-primary text-text bg-surface-hover'
                      : 'border-border text-text-muted hover:text-text hover:bg-surface-hover'
                  }`}
                >
                  <CellIcon size={14} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Color picker: 10 swatch keys rendered as squares via the palette
            CSS variables (user-chosen color data, not theme tokens). */}
        <div>
          <label className={labelClass}>{t('colorLabel')}</label>
          <div
            role="radiogroup"
            aria-label={t('colorLabel')}
            onKeyDown={(e) => radioGroupKeyDown(e, BOOKMARK_COLOR_KEYS, color, setColor, colorCellRefs)}
            className="flex flex-wrap gap-2"
          >
            {BOOKMARK_COLOR_KEYS.map((key, i) => {
              const isSelected = key === color
              return (
                <button
                  key={key}
                  ref={(el) => { colorCellRefs.current[i] = el }}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  aria-label={t(`colors.${key}`, { defaultValue: key })}
                  onClick={() => setColor(key)}
                  className={`h-8 w-8 rounded-none flex items-center justify-center border bg-surface hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus pointer-coarse:h-[44px] pointer-coarse:w-[44px] ${
                    isSelected ? 'border-primary ring-1 ring-primary' : 'border-border'
                  }`}
                >
                  <span className="h-5 w-5 rounded-none" style={{ backgroundColor: bookmarkColorVar(key) }} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Read-only target summary: what the bookmark opens. The target is
            fixed at create; edit shows it so the user knows which row they
            are editing. */}
        <div className="text-[11px] leading-relaxed text-text-muted">
          {/* Live preview: chosen glyph in the chosen swatch color, the typed
              name, and (budget targets) the currency chip. */}
          <div className="flex items-center gap-2 mb-1">
            <BookmarkGlyph bookmark={{ icon, color }} size={14} />
            <span className="text-xs text-text truncate">{name}</span>
            {targetCurrency && <span className={chipClass}>{targetCurrency}</span>}
          </div>
          {targetBudgetName ? (
            <p>
              {t('opensBudget')} <span className="text-[13px] text-text">{targetBudgetName}</span>{' '}
              {targetCurrency && <span className={chipClass}>{targetCurrency}</span>}
            </p>
          ) : targetPageKind ? (
            targetParams && filterCount > 0 ? (
              <p>
                {/* The numeral renders separately in mono; the plural is
                    selected via count without interpolating it. */}
                {t(`pageName.${targetPageKind}`)} · <span className="font-mono">{filterCount}</span>{' '}
                {t('activeFilters', { count: filterCount })}
              </p>
            ) : (
              <p>
                {t(`pageName.${targetPageKind}`)} · {t('noFiltersHint')}
              </p>
            )
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={pending} className={secondaryButtonClass}>
            {t('cancel')}
          </button>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? t('saving') : t('save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
