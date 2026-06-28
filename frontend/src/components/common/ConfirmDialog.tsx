import Modal from './Modal'

interface Props {
  isOpen: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel }: Props) {
  return (
    <Modal open={isOpen} onClose={onCancel} size="sm" className="p-4">
      <h2 className="text-base font-semibold text-text mb-2">{title}</h2>
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
          Delete
        </button>
      </div>
    </Modal>
  )
}
