import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BottomSheet from './BottomSheet'

export interface ActionSheetAction {
  label: string
  /** Lucide icon component (rendered at 16px — mobile-nav scale). */
  icon?: LucideIcon
  onSelect: () => void
  /** Renders the row in text-negative (delete, remove, archive-with-loss). */
  destructive?: boolean
  disabled?: boolean
}

interface ActionSheetProps {
  open: boolean
  onClose: () => void
  /** Context line above the actions, e.g. the row's description. */
  title?: string
  actions: ActionSheetAction[]
}

/**
 * Titled list of 44px tap actions in a bottom sheet - the touch replacement
 * for hover-revealed row actions. Selecting an action closes
 * the sheet first, then runs it, so actions can safely open modals.
 */
export default function ActionSheet({ open, onClose, title, actions }: ActionSheetProps) {
  const { t } = useTranslation('common')
  return (
    <BottomSheet open={open} onClose={onClose} aria-label={title ?? t('actionSheet.defaultLabel')}>
      {title && (
        <div className="px-4 pt-1 pb-2 text-[11px] font-medium uppercase tracking-wider text-text-muted truncate">
          {title}
        </div>
      )}

      <div className="border-t border-border divide-y divide-border">
        {actions.map((action, i) => (
          <button
            key={`${action.label}-${i}`}
            type="button"
            disabled={action.disabled}
            onClick={() => {
              onClose()
              action.onSelect()
            }}
            className={`w-full min-h-[44px] px-4 flex items-center gap-3 text-sm text-left transition-colors active:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed ${
              action.destructive ? 'text-negative' : 'text-text'
            }`}
          >
            {action.icon && <action.icon size={16} strokeWidth={1.5} className="flex-shrink-0" />}
            {action.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full min-h-[44px] px-4 text-sm font-medium text-text-muted border-t border-border transition-colors active:bg-surface-hover"
      >
        {t('actionSheet.cancel')}
      </button>
    </BottomSheet>
  )
}
