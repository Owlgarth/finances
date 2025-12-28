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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">Select Budget Period</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {periods.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No budget periods available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto max-h-[60vh]">
            {periods.map((period) => (
              <button
                key={period.id}
                onClick={() => handleSelectPeriod(period.id)}
                className={`p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                  selectedPeriodId === period.id
                    ? 'border-gray-900 bg-gray-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
                }`}
              >
                <h3 className="font-semibold text-gray-900 mb-1">{period.name}</h3>
                <p className="text-sm text-gray-600">
                  {new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()}
                </p>
                {period.weeks && (
                  <p className="text-xs text-gray-500 mt-1">{period.weeks} weeks</p>
                )}
                {selectedPeriodId === period.id && (
                  <div className="mt-2 text-xs font-medium text-gray-900 flex items-center gap-1">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Current period
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-6 pt-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}