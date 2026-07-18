import Modal from './Modal'

interface Props {
  isOpen: boolean
  title: string
  message: string
  /** Confirm-button label. Defaults to 'Delete' (the most common use). */
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ isOpen, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  return (
    <Modal open={isOpen} onClose={onCancel} size="sm" className="p-4" title={title}>
      <p className="text-text-muted mb-6">{message}</p>

      <div className="flex justify-end space-x-3">
        <button
          onClick={onCancel}
          autoFocus
          className="px-3 py-1.5 bg-surface border border-border text-text rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 bg-negative text-white rounded-sm text-xs font-medium hover:bg-negative/90 transition-colors"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
