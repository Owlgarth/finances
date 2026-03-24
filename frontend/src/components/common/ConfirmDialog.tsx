interface Props {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }: Props) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center z-50 transition-opacity backdrop-blur-[1px]">
      <div 
        className="bg-surface-container-lowest rounded-xl p-6 w-full max-w-md"
        style={{ boxShadow: 'var(--shadow-float)' }}
      >
        <h2 className="font-headline font-bold text-on-surface text-xl mb-2">{title}</h2>
        <p className="text-on-surface-variant mb-6">{message}</p>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container transition-all text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-negative text-white rounded-lg hover:opacity-90 active:scale-[0.98] transition-all text-sm font-medium shadow-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
