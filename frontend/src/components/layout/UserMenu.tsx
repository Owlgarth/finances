import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, LogOut } from 'lucide-react'
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
            <div className="px-4 py-2 text-sm text-text-muted mb-1 truncate">
              {user?.email}
            </div>
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/profile')
              }}
              className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-hover transition-colors flex items-center gap-2"
            >
              <User size={14} />
              Profile
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                logout()
              }}
              className="w-full text-left px-4 py-2 text-sm text-text hover:bg-surface-hover transition-colors flex items-center gap-2"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  )
}
