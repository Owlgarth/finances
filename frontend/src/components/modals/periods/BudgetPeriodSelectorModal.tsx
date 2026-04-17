import { X, CircleCheck } from 'lucide-react'
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
        className="bg-surface border border-border rounded-sm p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={14} />
        </button>

        <h2 className="font-semibold text-text text-sm mb-6">Select Budget Period</h2>

        {periods.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-muted font-sans">No budget periods available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
            {periods.map((period) => (
              <button
                key={period.id}
                onClick={() => handleSelectPeriod(period.id)}
                className={`p-4 rounded-sm transition-colors duration-200 text-left group border
                  ${selectedPeriodId === period.id
                    ? 'bg-surface-hover text-text border-primary'
                    : 'bg-surface hover:bg-surface-hover text-text border-border'
                }`}
              >
                <h3 className={`font-semibold mb-1 text-text`}>
                  {period.name}
                </h3>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  {new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()}
                </p>
                {period.weeks && (
                  <p className="font-mono text-[9px] uppercase tracking-widest mt-2 text-text-muted">{period.weeks} weeks</p>
                )}
                {selectedPeriodId === period.id && (
                  <div className="mt-3 text-[10px] font-medium font-mono uppercase tracking-widest flex items-center gap-1.5 text-text">
                    <CircleCheck size={12} />
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
            className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
