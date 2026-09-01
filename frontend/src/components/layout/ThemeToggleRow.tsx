import { Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../contexts/ThemeContext'
import Switch from '../common/Switch'

/** Dark-mode toggle row shared by the desktop UserMenu dropdown and the
 *  mobile More sheet (BottomNav). 44px minimum height per the touch-target
 *  rule; hover affordance for the desktop dropdown. */
export default function ThemeToggleRow() {
  const { t } = useTranslation('nav')
  const { isDark, toggleTheme } = useTheme()
  return (
    <div className="flex items-center justify-between min-h-[44px] px-4 hover:bg-surface-hover transition-colors">
      <span className="flex items-center gap-3 text-sm text-text">
        <Moon size={16} strokeWidth={1.5} className="flex-shrink-0" />
        {t('darkMode')}
      </span>
      <Switch checked={isDark} onChange={() => toggleTheme()} aria-label={t('darkMode')} />
    </div>
  )
}
