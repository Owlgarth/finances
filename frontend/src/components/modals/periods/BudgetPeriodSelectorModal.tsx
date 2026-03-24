import { useBudgetPeriod } from '../../../contexts/BudgetPeriodContext'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function BudgetPeriodSelectorModal({ isOpen, onClose }: Props) {
  const { selectedPeriodId, setSelectedPeriodId, periods } = useBudgetPeriod()

  if (!isOpen) return null

  const handleSelectPeriod = (periodId: number) => {
    setSelectedPeriodId(periodId)
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

        <h2 className="font-headline font-bold text-on-surface text-xl mb-6">Select Budget Period</h2>

        {periods.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-on-surface-variant font-headline">No budget periods available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {periods.map((period) => (
              <button
                key={period.id}
                onClick={() => handleSelectPeriod(period.id)}
                className={`p-4 rounded-xl transition-all duration-200 text-left group
                  ${selectedPeriodId === period.id
                    ? 'bg-primary-container text-on-primary-container ring-2 ring-primary shadow-sm'
                    : 'bg-surface-container-low hover:bg-surface-container-high hover:shadow-sm text-on-surface'
                }`}
              >
                <h3 className={`font-headline font-bold mb-1 ${selectedPeriodId === period.id ? 'text-on-primary-container' : 'text-on-surface'}`}>
                  {period.name}
                </h3>
                <p className="font-mono text-[10px] uppercase tracking-wider opacity-70">
                  {new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()}
                </p>
                {period.weeks && (
                  <p className="font-mono text-[9px] uppercase tracking-widest mt-2 opacity-60">{period.weeks} weeks</p>
                )}
                {selectedPeriodId === period.id && (
                  <div className="mt-3 text-[10px] font-bold font-mono uppercase tracking-widest flex items-center gap-1.5 text-on-primary-container">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Selected
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
