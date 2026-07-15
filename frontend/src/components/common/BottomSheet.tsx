import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useOverlay } from '../../hooks/useOverlay'

interface BottomSheetProps {
  /** Whether the sheet is visible. Caller still owns the source of truth. */
  open: boolean
  /** Called when the user requests close (scrim tap, Escape, drag handle later). */
  onClose: () => void
  /** Sheet body — caller provides header/form/footer/list markup. */
  children: ReactNode
  /** Extra classes appended to the PANEL div (padding, flex layout). Never the scrim. */
  className?: string
  /** Accessible dialog name; set it when the children don't start with a heading. */
  'aria-label'?: string
  /** Render an X in the sticky handle row (Modal delegation) — stays visible while the body scrolls. */
  showClose?: boolean
}

/**
 * Keeps the sheet mounted for `exitMs` after `open` flips false so the
 * slide-down animation can play before unmount.
 */
function useDelayedUnmount(open: boolean, exitMs: number): boolean {
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const timer = setTimeout(() => setMounted(false), exitMs)
    return () => clearTimeout(timer)
  }, [open, exitMs])

  return mounted
}

/**
 * The universal mobile container (plan decision 3): modals, selects, action
 * menus and pickers all render inside this on mobile. Slide-up panel pinned to
 * the bottom edge, scrim dismiss, body scroll-lock, safe-area padding.
 * Drag-to-dismiss gesture is deferred to N2 — the handle is a visual affordance.
 */
/**
 * Height of the on-screen keyboard overlapping the layout viewport (N2).
 * iOS doesn't resize the layout viewport for the keyboard, so a bottom-fixed
 * sheet would sit behind it; visualViewport tells us how much to lift.
 */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    if (!vv) return
    const update = () =>
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      setInset(0)
    }
  }, [active])

  return inset
}

export default function BottomSheet({
  open,
  onClose,
  children,
  className = '',
  'aria-label': ariaLabel,
  showClose = false,
}: BottomSheetProps) {
  const mounted = useDelayedUnmount(open, 80) // matches sheet-out duration
  const panelRef = useOverlay(open, onClose)
  const keyboardInset = useKeyboardInset(open)

  if (!mounted) return null

  const motion = open ? 'animate-sheet-in' : 'animate-sheet-out'
  const scrimMotion = open ? 'animate-scrim-in' : 'animate-scrim-out'

  return (
    <>
      {/* Backdrop — visual scrim only (dismiss lives on the wrapper below, same
          structure as Modal.tsx and for the same z-order reason). */}
      <div
        className={`fixed inset-0 z-modal-backdrop bg-scrim backdrop-blur-sm ${scrimMotion}`}
        aria-hidden="true"
      />

      {/* Wrapper pins the panel to the bottom edge and owns scrim-tap dismiss;
          the panel stops propagation so taps inside don't close the sheet. */}
      <div
        className="fixed inset-0 z-modal flex items-end"
        style={keyboardInset ? { paddingBottom: keyboardInset } : undefined}
        onClick={onClose}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={`relative w-full bg-surface border border-border rounded-t-sm max-h-[92dvh] overflow-y-auto overscroll-contain pb-safe outline-none ${motion} ${className}`}
          style={keyboardInset ? { maxHeight: `calc(100dvh - ${keyboardInset}px)` } : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drag-handle bar (+ optional close, pinned with it) */}
          <div className="sticky top-0 z-10 bg-surface">
            <div className="flex justify-center pt-2 pb-1" aria-hidden="true">
              <div className="h-1 w-9 rounded-sm bg-surface-muted" />
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-1 flex items-center justify-center p-1 text-text-muted hover:text-text active:bg-surface-hover transition-colors touch-hit"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>

          {children}
        </div>
      </div>
    </>
  )
}
