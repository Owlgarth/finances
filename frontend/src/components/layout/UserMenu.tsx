import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Globe, LogOut, RotateCw, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../i18n/LanguageContext'
import LanguageModal from './LanguageModal'
import ThemeToggleRow from './ThemeToggleRow'
import registry from '../../../../backend/common/languages.json'

interface UserMenuProps {
  collapsed?: boolean
}

export default function UserMenu({ collapsed = false }: UserMenuProps) {
  const { user, logout } = useAuth()
  const { t } = useTranslation('nav')
  const { language } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  // Language picker modal; the dropdown closes itself before this opens.
  const [langOpen, setLangOpen] = useState(false)
  const navigate = useNavigate()
  const activeLanguage = registry.languages.find((l) => l.code === language)

  return (
    <>
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
            {/* Closes the dropdown before opening the language picker, so
                the modal is the only overlay layer (one Escape press, one
                dismissal). The active language's native name is registry
                data, shown truncated so a long name cannot break the
                w-48 dropdown. */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setLangOpen(true)
              }}
              className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-hover transition-colors flex items-center gap-2"
            >
              <Globe size={14} className="flex-shrink-0" />
              <span className="flex-1 truncate">{t('language')}</span>
              <span className="flex-shrink-0 max-w-[72px] truncate text-xs text-text-muted">
                {activeLanguage?.nativeName}
              </span>
            </button>
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

      {/* Language picker (mount-per-use): the opener row closes the dropdown
          first, so this is the only overlay layer while open. */}
      {langOpen && <LanguageModal onClose={() => setLangOpen(false)} />}
    </>
  )
}
