import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { HiUser, HiLogout } from 'react-icons/hi'

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
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        title={collapsed ? (user?.full_name || user?.email) : undefined}
      >
        <HiUser className="h-5 w-5 flex-shrink-0" />
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
          <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-md shadow-lg py-1 z-20 border border-gray-200">
            <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100 truncate">
              {user?.email}
            </div>
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/profile')
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <HiUser className="h-4 w-4" />
              Profile
            </button>
            <button
              onClick={() => {
                setIsOpen(false)
                logout()
              }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
            >
              <HiLogout className="h-4 w-4" />
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  )
}
