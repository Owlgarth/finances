import { useState } from 'react'
import { useBudgetAccount } from '../contexts/BudgetAccountContext'
import { HiBriefcase } from 'react-icons/hi'
import BudgetAccountSelectorModal from './modals/accounts/BudgetAccountSelectorModal'

export default function BudgetAccountSelector() {
  const { selectedAccount, accounts, isLoading } = useBudgetAccount()
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded animate-pulse">
        <div className="w-4 h-4 bg-gray-300 rounded" />
        <div className="w-24 h-4 bg-gray-300 rounded" />
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500">
        <HiBriefcase className="h-4 w-4" />
        <span>No accounts</span>
      </div>
    )
  }

  return (
    <>
      <div
        className="flex items-center gap-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors w-full md:w-auto min-w-[120px] cursor-pointer"
        onClick={() => setIsModalOpen(true)}
        style={{
          borderLeftColor: selectedAccount?.color || undefined,
          borderLeftWidth: '3px',
        }}
      >
        <div className="px-3 py-1.5 flex items-center gap-2 flex-1 min-w-0">
          <HiBriefcase className="h-4 w-4 text-gray-600 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700 truncate flex items-center gap-1">
            {selectedAccount?.icon && <span>{selectedAccount.icon}</span>}
            {selectedAccount?.name || 'Select account'}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsModalOpen(true)
          }}
          className="px-2 py-1.5 hover:bg-gray-100 rounded-r-lg transition-colors border-l border-gray-200"
          aria-label="Change budget account"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-gray-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
      <BudgetAccountSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
