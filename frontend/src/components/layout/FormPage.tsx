import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useKeyboardInset } from '../../hooks/useKeyboardInset'
import { controlHeightClass } from '../common/formStyles'

interface FormPageProps {
  /** Form title. UI text - callers pass a t()'d string. */
  title: string
  /** Called when the user leaves the form via the back affordance. The caller
      owns any unsaved-changes confirmation. */
  onClose: () => void
  /** Optional action rendered at the right end of the title row. */
  headerAction?: ReactNode
  /** Sticky footer node (action buttons). Omit for footer-less forms. */
  footer?: ReactNode
  children: ReactNode
}

// Same row-height contract as PageHeader's row (see the comment there).
const ROW_CLASS =
  'flex items-center gap-3 min-h-8 pointer-coarse:min-h-[44px] max-sm:min-h-12! mb-4'

// Back affordance - keep in sync with the identical copy in PageHeader.tsx
// (two consumers; extract a shared piece at the third).
const BACK_BUTTON_CLASS =
  'shrink-0 flex items-center justify-center rounded-sm text-text-muted hover:text-text hover:bg-surface-hover ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  `${controlHeightClass} pointer-coarse:min-w-[44px]`

export default function FormPage({ title, onClose, headerAction, footer, children }: FormPageProps) {
  const { t } = useTranslation('common')
  const { isMobile } = useBreakpoint()
  const keyboardInset = useKeyboardInset(true)

  // Sticky offset composition. Phones: the class pins the footer above the
  // fixed bottom nav using the same 4.5rem + safe-area reservation
  // MainLayout's mobile <main> pads by - keep the two in sync (two consumers;
  // hoist to a shared constant at the third). When the on-screen keyboard is
  // visible the visualViewport inset takes over via an inline style, and
  // max() composes the two: the keyboard lift never drops the nav clearance
  // and a partial keyboard never sinks below it. Above phone width there is
  // no bottom nav, so only the keyboard inset applies.
  const footerStyle = keyboardInset
    ? {
        bottom: isMobile
          ? `max(${keyboardInset}px, calc(4.5rem + env(safe-area-inset-bottom)))`
          : `${keyboardInset}px`,
      }
    : undefined

  return (
    <div className="flex flex-col">
      <div className={ROW_CLASS}>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('pageHeader.back')}
          className={BACK_BUTTON_CLASS}
        >
          <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <h1 className="text-base font-semibold text-text truncate">{title}</h1>
        {headerAction && <div className="ml-auto flex items-center gap-2">{headerAction}</div>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      {footer && (
        <div
          className="sticky bottom-0 max-sm:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 bg-surface border-t border-border pt-3"
          style={footerStyle}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
