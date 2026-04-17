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
      <div className="bg-surface border border-border rounded-sm p-6 w-full max-w-md">
        <h2 className="text-base font-semibold text-text mb-2">{title}</h2>
        <p className="text-text-muted mb-6">{message}</p>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 bg-surface border border-border text-text rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 bg-negative text-white rounded-sm text-xs font-medium hover:bg-negative/90 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
