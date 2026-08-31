import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useOverlay } from '../../hooks/useOverlay'
import BottomSheet from './BottomSheet'

interface ModalProps {
  /** Whether the modal is visible. Caller still owns the source of truth. */
  open: boolean
  /** Called when the user requests close (Close button, scrim click, Escape). */
  onClose: () => void
  /** Panel body — caller provides form/footer/list markup below the header row. */
  children: ReactNode
  /** Panel max-width. Defaults to 'md'. Ignored on mobile (sheets are full-width). */
  size?: 'sm' | 'md' | 'lg'
  /** Extra classes appended to the PANEL div (padding, overflow, max-height, flex layout). Never the scrim. */
  className?: string
  /** Dialog title, rendered on the left of the header row. The labeled Close
      button always occupies the right side of that row, so it can never
      overlap the title. */
  title?: string
}

const SIZE_CLASS = {
  sm: 'max-w-sm',   // 384px
  md: 'max-w-lg',   // 512px
  lg: 'max-w-2xl',  // 672px
} as const

export default function Modal({
  open,
  onClose,
  children,
  size = 'md',
  className = '',
  title,
}: ModalProps) {
  const { isMobile } = useBreakpoint()
  const { t } = useTranslation('common')
  // Desktop-only wiring — BottomSheet runs its own useOverlay on mobile.
  const panelRef = useOverlay(open && !isMobile, onClose)

  // Header row: title left, labeled Close right, always rendered.
  const header = (
    <div className="flex items-start justify-between gap-3 mb-4">
      {title ? (
        <h2 className="text-base font-semibold text-text">{title}</h2>
      ) : (
        <span aria-hidden="true" />
      )}
      <button
        type="button"
        onClick={onClose}
        className="-mr-1 flex-shrink-0 flex items-center gap-1.5 px-2 py-1 pointer-coarse:min-h-[44px] rounded-sm text-xs font-medium text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
      >
        <X size={14} strokeWidth={1.5} />
        {t('modal.close')}
      </button>
    </div>
  )

  // Mobile: same API, bottom-sheet presentation (plan decision 3). The header
  // row (with the labeled Close button) renders inside the sheet body, below
  // the drag handle.
  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} className={className} aria-label={title}>
        {header}
        {children}
      </BottomSheet>
    )
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop — visual scrim only (dismiss-on-outside-click is owned by the wrapper below,
          which sits above this at z-modal and would otherwise intercept the click). */}
      <div
        className="fixed inset-0 z-modal-backdrop bg-scrim backdrop-blur-sm"
        aria-hidden="true"
      />

      {/* Panel wrapper — centers the panel; sits above the backdrop. Clicking the dimmed area
          (i.e. the wrapper, NOT the panel) dismisses; the panel stops propagation so clicks
          inside the body/buttons don't bubble up and close the modal. */}
      <div
        className="fixed inset-0 z-modal flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={`relative bg-surface border border-border rounded-sm w-full outline-none ${SIZE_CLASS[size]} ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          {header}
          {children}
        </div>
      </div>
    </>
  )
}
