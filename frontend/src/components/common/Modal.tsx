import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useOverlay } from '../../hooks/useOverlay'
import BottomSheet from './BottomSheet'

interface ModalProps {
  /** Whether the modal is visible. Caller still owns the source of truth. */
  open: boolean
  /** Called when the user requests close (X button, scrim click, Escape). */
  onClose: () => void
  /** Panel body — caller provides header/form/footer/list markup. */
  children: ReactNode
  /** Panel max-width. Defaults to 'md'. Ignored on mobile (sheets are full-width). */
  size?: 'sm' | 'md' | 'lg'
  /** Extra classes appended to the PANEL div (padding, overflow, max-height, flex layout). Never the scrim. */
  className?: string
  /** Optional dialog title. When set, the title renders in a header row and the close X gets a
      reserved slot (so it can never overlap the title): on desktop title + X share a flex row;
      on mobile the title renders alone and the X stays in the BottomSheet sticky handle row. */
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
  // Desktop-only wiring — BottomSheet runs its own useOverlay on mobile.
  const panelRef = useOverlay(open && !isMobile, onClose)

  const header = title ? (
    isMobile ? (
      // Mobile: title only — the X lives in the BottomSheet sticky handle row
      // (stays visible while the body scrolls), so it must not be duplicated here.
      <h2 className="text-base font-semibold text-text mb-5">{title}</h2>
    ) : (
      // Desktop: title + X in one flex row. The X gets a reserved flex-shrink-0
      // slot with gap-4, so it can never overlap the title (the original bug).
      <div className="flex items-start justify-between gap-4 mb-5">
        <h2 className="text-base font-semibold text-text">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 -mr-1 flex-shrink-0 flex items-center justify-center p-1 rounded-none text-text-muted hover:text-text hover:bg-surface-hover transition-colors touch-hit"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>
    )
  ) : null

  // Mobile: same API, bottom-sheet presentation (plan decision 3). The X always
  // lives in the sheet's sticky handle row so it doesn't scroll away with the
  // body; the title (if any) renders as a plain <h2> below the handle.
  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} className={className} showClose aria-label={title}>
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
