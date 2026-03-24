import { useState } from 'react'
import { useBudgetAccount } from '../contexts/BudgetAccountContext'
import BudgetAccountSelectorModal from './modals/accounts/BudgetAccountSelectorModal'

export default function BudgetAccountSelector() {
  const { selectedAccount, accounts, isLoading } = useBudgetAccount()
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-low rounded animate-pulse">
        <div className="w-4 h-4 bg-surface-container-high rounded" />
        <div className="w-24 h-4 bg-surface-container-high rounded" />
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-on-surface-variant font-mono text-[10px] uppercase tracking-wider">
        <span className="material-symbols-outlined text-base">account_balance</span>
        <span>No accounts</span>
      </div>
    )
  }

  return (
    <>
      <div
        className="flex items-center gap-2 bg-surface-container-highest rounded-lg hover:bg-surface-container-high transition-colors w-full md:w-auto min-w-[120px] cursor-pointer group overflow-hidden"
        onClick={() => setIsModalOpen(true)}
        style={{
          borderLeftColor: selectedAccount?.color || 'transparent',
          borderLeftWidth: '3px',
        }}
      >
        <div className="px-3 py-1.5 flex items-center gap-2 flex-1 min-w-0">
          <span className="material-symbols-outlined text-base text-on-surface-variant flex-shrink-0 select-none">account_balance</span>
          <span className="font-mono text-sm font-medium text-on-surface truncate flex items-center gap-1">
            {selectedAccount?.icon && <span>{selectedAccount.icon}</span>}
            {selectedAccount?.name || 'Select account'}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsModalOpen(true)
          }}
          className="px-2 py-1.5 hover:bg-surface-container transition-colors rounded-r-lg flex items-center justify-center"
          aria-label="Change budget account"
        >
          <span className="material-symbols-outlined text-base text-on-surface-variant select-none">expand_more</span>
        </button>
      </div>
      <BudgetAccountSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
