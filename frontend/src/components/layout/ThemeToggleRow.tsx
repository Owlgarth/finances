import { Moon } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import Switch from '../common/Switch'

/** Dark-mode toggle row shared by the desktop UserMenu dropdown and the
 *  mobile More sheet (BottomNav). 44px minimum height per the touch-target
 *  rule; hover affordance for the desktop dropdown. */
export default function ThemeToggleRow() {
  const { isDark, toggleTheme } = useTheme()
  return (
    <div className="flex items-center justify-between min-h-[44px] px-4 hover:bg-surface-hover transition-colors">
      <span className="flex items-center gap-3 text-sm text-text">
        <Moon size={16} strokeWidth={1.5} className="flex-shrink-0" />
        Dark mode
      </span>
      <Switch checked={isDark} onChange={() => toggleTheme()} aria-label="Dark mode" />
    </div>
  )
}
