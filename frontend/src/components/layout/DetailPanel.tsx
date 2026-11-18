import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { hasActiveOverlay } from '../../hooks/useOverlay'

interface DetailPanelProps {
  /** Panel heading, left of the header row. Callers pass t() strings. */
  title?: string
  /** Called on Escape (when no overlay is open) and on the Close button.
      The caller's conditional render is the open/close mechanism. */
  onClose: () => void
  /** Action row pinned below the scrolling body (save state, Duplicate, Delete). */
  footer?: ReactNode
  children: ReactNode
}

/**
 * In-flow record panel for SplitView's panel slot - a card in the page
 * flow, NOT an overlay: no scrim, focus trap, scroll lock, useOverlay, or
 * z-index. Escape closes it through a bubble-phase document listener that
 * yields while any blocking overlay is open (the overlay stack owns the
 * key then, topmost-only close), so nested popups that consume Escape at
 * their own focusable element (DatePicker's desktop popup) stop
 * propagation before this fires - a capture-phase listener would close
 * both. Carries NO width utility: the host slot owns width
 * (one-width-class rule).
 */
export default function DetailPanel({ title, onClose, footer, children }: DetailPanelProps) {
  const { t } = useTranslation('common')

  // Latest-callback ref (useOverlay's pattern): the listener registers once
  // and always calls the current onClose.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Yield Escape while a blocking overlay is open - the overlay stack
      // owns the key then (topmost-only close).
      if (e.key !== 'Escape' || hasActiveOverlay()) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', handleKeydown)
    return () => document.removeEventListener('keydown', handleKeydown)
  }, [])

  return (
    <section
      aria-label={title}
      className="flex flex-col h-full bg-surface border border-border rounded-sm"
    >
      {/* Header row: Modal's register - title left, labeled Close right,
          shrink-0 so it can never overlap the title; never absolutely
          positioned over content. */}
      <div className="flex items-start justify-between gap-3 p-4 shrink-0">
        {title ? (
          <h2 className="text-base font-semibold text-text">{title}</h2>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 flex items-center gap-1.5 px-2 py-1 pointer-coarse:min-h-[44px] rounded-sm text-xs font-medium text-text-muted hover:text-text hover:bg-surface-hover transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
        >
          <X size={14} strokeWidth={1.5} />
          {t('detailPanel.close')}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">{children}</div>
      {footer && <div className="shrink-0 border-t border-border p-4">{footer}</div>}
    </section>
  )
}
