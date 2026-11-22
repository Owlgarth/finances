import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Search, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { controlHeightClass } from '../common/formStyles'
import { openPageSearch } from '../common/CommandPalette'
import { useAccountMenu } from './AccountMenuContext'

interface PageHeaderProps {
  /** Page title. UI text - callers pass a t()'d string. */
  title: string
  /** Context breadcrumb ("Feb 2026 / Example Account"). Caller-derived data,
      rendered in the metadata register; not translated here. */
  breadcrumb?: string
  /** Route path for the leading back affordance. Omit to hide the button. */
  backTo?: string
  /** Back-navigation override. When provided the back button calls this
      (e.g. navigate(-1), a POP) instead of pushing backTo; backTo still
      gates whether the button renders. */
  onBack?: () => void
  /** Page-level action buttons, right-aligned on the row. */
  actions?: ReactNode
  /** Phone-only account actions (search + profile icon buttons, hidden
      from sm up): open the command palette and the account menu sheet. */
  showAccountActions?: boolean
}

// Row height is a MIN-HEIGHT composition, not a fixed h-8: coarse-pointer
// tablets must fit 44px controls (controlHeightClass floor) and phones get
// the 48px row. The max-sm floor carries the important suffix because
// pointer-coarse rules compile AFTER max-sm rules in the sheet (verified
// offsets in dist/assets/*.css), and 48px must win when both match a phone.
const ROW_CLASS =
  'flex flex-wrap items-center justify-between gap-y-3 min-h-8 pointer-coarse:min-h-[44px] max-sm:min-h-12! mb-6'

// Header-row icon-button register: the back affordance and the phone-only
// account-action pair. Keep in sync with the identical copy in
// FormPage.tsx - two files; extract a shared piece at the third.
const BACK_BUTTON_CLASS =
  'shrink-0 flex items-center justify-center rounded-sm text-text-muted hover:text-text hover:bg-surface-hover ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ' +
  `${controlHeightClass} pointer-coarse:min-w-[44px]`

export default function PageHeader({ title, breadcrumb, backTo, onBack, actions, showAccountActions }: PageHeaderProps) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const { open: openAccountMenu } = useAccountMenu()

  return (
    <header className={ROW_CLASS}>
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <button
            type="button"
            onClick={onBack ?? (() => navigate(backTo))}
            aria-label={t('pageHeader.back')}
            className={BACK_BUTTON_CLASS}
          >
            <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        )}
        {breadcrumb && (
          <span className="font-mono text-[11px] text-text-muted truncate">{breadcrumb}</span>
        )}
        {breadcrumb && (
          <span className="text-text-muted" aria-hidden="true">/</span>
        )}
        <h1 className="text-base font-semibold text-text">{title}</h1>
      </div>
      {showAccountActions && (
        // Phone-only pair (hidden from sm up): same icon-button register
        // as the back affordance, coarse-pointer width floor included.
        <div className="flex items-center gap-2 sm:hidden">
          <button
            type="button"
            onClick={openPageSearch}
            aria-label={t('pageHeader.search')}
            className={BACK_BUTTON_CLASS}
          >
            <Search size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={openAccountMenu}
            aria-label={t('pageHeader.profile')}
            className={BACK_BUTTON_CLASS}
          >
            <User size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      )}
      {actions && (
        <div className="flex gap-2 items-center max-sm:w-full max-sm:justify-end">{actions}</div>
      )}
    </header>
  )
}
