import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, RotateCw, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import LanguageMenu from './LanguageMenu'
import ThemeToggleRow from './ThemeToggleRow'

interface UserMenuProps {
  collapsed?: boolean
}

export default function UserMenu({ collapsed = false }: UserMenuProps) {
  const { user, logout } = useAuth()
  const { t } = useTranslation('nav')
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-sm text-text-muted hover:bg-surface-hover hover:text-primary transition-all"
        title={collapsed ? (user?.full_name || user?.email) : undefined}
      >
        <User size={14} className="flex-shrink-0" />
        {!collapsed && (
          <span className="text-sm font-medium truncate">
            {user?.full_name || user?.email}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div 
            className="absolute bottom-full left-0 mb-2 w-48 bg-surface rounded-sm border border-border py-1 z-20"
          >
            {/* Reload — mirrors the mobile More sheet (PWA-friendly refresh). */}
            <button
              onClick={() => window.location.reload()}
              className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-hover transition-colors flex items-center gap-2"
            >
              <RotateCw size={14} />
              {t('reload')}
            </button>
            <ThemeToggleRow />
            <LanguageMenu />
            <div className="border-b border-border my-1" />
            <div className="px-4 py-2 text-sm text-text-muted mb-1 truncate">
              {user?.email}
            </div>
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/settings')
              }}
              className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-hover transition-colors flex items-center gap-2"
            >
              <User size={14} />
              {t('profile')}
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                logout()
              }}
              className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-hover transition-colors flex items-center gap-2"
            >
              <LogOut size={14} />
              {t('logout')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
