import { X, CircleCheck } from 'lucide-react'
import { useBudgetAccount } from '../../../contexts/BudgetAccountContext'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function BudgetAccountSelectorModal({ isOpen, onClose }: Props) {
  const { selectedAccountId, setSelectedAccountId, accounts } = useBudgetAccount()

  if (!isOpen) return null

  const handleSelectAccount = (accountId: number) => {
    setSelectedAccountId(accountId)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center z-50 p-4 backdrop-blur-[1px]">
      <div
        className="bg-surface border border-border rounded-sm p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={14} />
        </button>

        <h2 className="font-semibold text-text text-sm mb-6">Select Budget Account</h2>

        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted font-sans">No budget accounts available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => handleSelectAccount(account.id)}
                className={`p-4 rounded-sm transition-colors duration-200 text-left relative overflow-hidden group border
                  ${selectedAccountId === account.id
                    ? 'bg-surface-hover border-primary'
                    : 'bg-surface hover:bg-surface-hover text-text border-border'
                }`}
                style={{
                  borderLeftColor: account.color || 'transparent',
                  borderLeftWidth: '4px',
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  {account.icon && (
                    <span className="text-2xl select-none">{account.icon}</span>
                  )}
                  <h3 className={`font-semibold truncate flex-1 text-text`}>
                    {account.name}
                  </h3>
                </div>
                {account.description && (
                  <p className={`text-sm mb-3 font-sans leading-snug text-text-muted`}
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {account.description}
                  </p>
                )}
                <div className={`flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-text-muted`}>
                  <span>Default: {account.default_currency}</span>
                  {account.is_active && (
                    <span className={`${selectedAccountId === account.id ? 'text-text' : 'text-positive'} font-medium`}>Active</span>
                  )}
                </div>
                {selectedAccountId === account.id && (
                  <div className="absolute top-2 right-2 text-primary">
                    <CircleCheck size={14} />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-8">
          <button
            onClick={onClose}
            className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
