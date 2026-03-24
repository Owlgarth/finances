import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface UserMenuProps {
  collapsed?: boolean
}

export default function UserMenu({ collapsed = false }: UserMenuProps) {
  const { user, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-on-surface/70 hover:bg-white/50 hover:text-primary transition-all"
        title={collapsed ? (user?.full_name || user?.email) : undefined}
      >
        <span className="material-symbols-outlined text-xl flex-shrink-0 select-none">person</span>
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
            className="absolute bottom-full left-0 mb-2 w-48 bg-surface-container-lowest rounded-lg py-1 z-20"
            style={{ boxShadow: 'var(--shadow-float)' }}
          >
            <div className="px-4 py-2 text-sm text-on-surface-variant mb-1 truncate">
              {user?.email}
            </div>
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/profile')
              }}
              className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base select-none">person</span>
              Profile
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                logout()
              }}
              className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base select-none">logout</span>
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  )
}
