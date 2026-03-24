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
        className="bg-surface-container-lowest rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col relative"
        style={{ boxShadow: 'var(--shadow-float)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <h2 className="font-headline font-bold text-on-surface text-xl mb-6">Select Budget Account</h2>

        {accounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-on-surface-variant font-headline">No budget accounts available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => handleSelectAccount(account.id)}
                className={`p-4 rounded-xl transition-all duration-200 text-left relative overflow-hidden group
                  ${selectedAccountId === account.id
                    ? 'bg-primary-container ring-2 ring-primary shadow-sm'
                    : 'bg-surface-container-low hover:bg-surface-container-high hover:shadow-sm text-on-surface'
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
                  <h3 className={`font-headline font-bold truncate flex-1 ${selectedAccountId === account.id ? 'text-on-primary-container' : 'text-on-surface'}`}>
                    {account.name}
                  </h3>
                </div>
                {account.description && (
                  <p className={`text-sm mb-3 font-headline leading-snug opacity-80
                    ${selectedAccountId === account.id ? 'text-on-primary-container' : 'text-on-surface-variant'}`}
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
                <div className={`flex items-center justify-between font-mono text-[9px] uppercase tracking-widest
                  ${selectedAccountId === account.id ? 'text-on-primary-container/70' : 'text-outline'}`}>
                  <span>Default: {account.default_currency}</span>
                  {account.is_active && (
                    <span className={`${selectedAccountId === account.id ? 'text-on-primary-container' : 'text-positive'} font-bold`}>Active</span>
                  )}
                </div>
                {selectedAccountId === account.id && (
                  <div className="absolute top-2 right-2 text-primary">
                    <span className="material-symbols-outlined text-base">check_circle</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-8">
          <button
            onClick={onClose}
            className="bg-surface-container-high text-on-surface px-4 py-2 rounded-lg hover:bg-surface-container transition-all text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
