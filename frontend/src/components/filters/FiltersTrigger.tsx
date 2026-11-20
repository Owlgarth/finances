import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { controlHeightClass } from '../common/formStyles'

interface FiltersTriggerProps {
  /** True while the phone FilterSheet is open (drives aria-expanded). */
  open: boolean
  /** Registry active-filter count INCLUDING date - the page's badge value. */
  count: number
  onOpen: () => void
}

/** Phone-only Filters trigger: opens the FilterSheet bottom sheet. The
 *  sm:hidden gate is baked in - this affordance exists only below 640, and
 *  no call site can forget the gate. Dialog-trigger semantics: the sheet is
 *  a modal dialog, not an accordion region, so there is no controls id. */
export function FiltersTrigger({ open, count, onOpen }: FiltersTriggerProps) {
  const { t } = useTranslation('common')
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={`bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors inline-flex items-center gap-1.5 ${controlHeightClass} shrink-0 sm:hidden`}
    >
      <SlidersHorizontal size={13} />
      {t('filters.toggle')}
      {count > 0 && (
        <span className="min-w-[16px] h-4 px-1 rounded-sm bg-primary text-white text-[10px] font-mono inline-flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  )
}
