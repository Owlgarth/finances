import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import { primaryButtonClass, secondaryButtonClass, solidNegativeButtonClass } from './formStyles'

interface Props {
  isOpen: boolean
  title: string
  message: string
  /** Confirm-button label. Defaults to the translated Delete label (the most common use). */
  confirmLabel?: string
  /** Solid-negative confirm styling (default — the historical look). Pass
      false for a primary-styled, non-destructive confirm. */
  destructive?: boolean
  /** Disables both buttons while the confirmed mutation is in flight, so a
      double-click can't double-fire it. Callers wire this (Tasks 9/10). */
  isPending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  destructive = true,
  isPending = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation('common')
  const confirmText = confirmLabel ?? t('confirmDialog.delete')
  return (
    <Modal open={isOpen} onClose={onCancel} size="sm" className="p-4" title={title}>
      <p className="text-text-muted mb-6">{message}</p>

      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          autoFocus
          disabled={isPending}
          className={secondaryButtonClass}
        >
          {t('confirmDialog.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className={destructive ? solidNegativeButtonClass : primaryButtonClass}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
