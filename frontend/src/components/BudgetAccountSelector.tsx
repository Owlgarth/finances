import { useState } from 'react'
import { Landmark, ChevronDown } from 'lucide-react'
import { useBudgetAccount } from '../contexts/BudgetAccountContext'
import BudgetAccountSelectorModal from './modals/accounts/BudgetAccountSelectorModal'

export default function BudgetAccountSelector() {
  const { selectedAccount, accounts, isLoading } = useBudgetAccount()
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface rounded-sm animate-pulse">
        <div className="w-4 h-4 bg-surface-hover rounded-sm" />
        <div className="w-24 h-4 bg-surface-hover rounded-sm" />
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted font-mono text-[10px] uppercase tracking-wider">
        <Landmark size={14} />
        <span>No accounts</span>
      </div>
    )
  }

  return (
    <>
      <div
        className="flex items-center gap-2 bg-surface rounded-sm hover:bg-surface-hover transition-colors w-full md:w-auto min-w-[120px] cursor-pointer group overflow-hidden border border-border"
        onClick={() => setIsModalOpen(true)}
        style={{
          borderLeftColor: selectedAccount?.color || 'transparent',
          borderLeftWidth: '3px',
        }}
      >
        <div className="px-3 py-1.5 flex items-center gap-2 flex-1 min-w-0">
          <Landmark size={14} className="text-text-muted flex-shrink-0 select-none" />
          <span className="font-mono text-sm font-medium text-text truncate flex items-center gap-1">
            {selectedAccount?.icon && <span>{selectedAccount.icon}</span>}
            {selectedAccount?.name || 'Select account'}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setIsModalOpen(true)
          }}
          className="px-2 py-1.5 hover:bg-surface-muted transition-colors rounded-r-sm flex items-center justify-center"
          aria-label="Change budget account"
        >
          <ChevronDown size={14} className="text-text-muted select-none" />
        </button>
      </div>
      <BudgetAccountSelectorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}
