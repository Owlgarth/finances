import { Copy, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../../common/Modal'
import TransactionItemsEditor from '../../transactions/TransactionItemsEditor'
import TransactionAttachments from '../../transactions/TransactionAttachments'
import TransactionFormFields from '../../transactions/TransactionFormFields'
import type { ParsedReceipt, Transaction } from '../../../types'
import { destructiveButtonClass, primaryButtonClass, secondaryButtonClass } from '../../common/formStyles'
import { useTransactionForm } from '../../../hooks/useTransactionForm'

interface Props {
  open: boolean
  onClose: () => void
  transaction?: Transaction | null
  /** Copy mode: prefill every field from this transaction except the date
      (today instead) and save as a NEW transaction. Ignored while editing. */
  copyFrom?: Transaction | null
  /** Edit mode only: renders a Delete button in the footer. Caller owns the
      confirm flow (and closing this modal). */
  onDelete?: (transaction: Transaction) => void
  /** Edit mode only: renders a Copy button in the footer. Caller switches the
      modal into copy mode (transaction=null, copyFrom=t). */
  onCopy?: (transaction: Transaction) => void
  /** Receipt-first create entry (BottomNav "From receipt"): seeds amount/date/
      description + the editable items list + the pending attachment from an
      *already-parsed* receipt. Applied at most once per receipt object: the
      parent sets it before flipping open and clears it on close, and a
      receipt arriving while the modal is already open is ignored - it never
      re-seeds mid-edit. Ignored unless create mode (no transaction/copyFrom). */
  prefillReceipt?: { file: File; parsed: ParsedReceipt } | null
}

/** Edit-mode detail tabs below the form. Internal keys only - the button
 *  labels resolve through t(). */
const DETAIL_TABS = ['items', 'receipts'] as const

export default function TransactionFormModal({ open, onClose, transaction, copyFrom, onDelete, onCopy, prefillReceipt = null }: Props) {
  const { t } = useTranslation('transactions')
  const form = useTransactionForm({ open, transaction, copyFrom, prefillReceipt })
  const isEdit = form.mode === 'edit'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await form.submit()
    if (result.ok) onClose()
  }

  return (
    <Modal open={open} onClose={onClose} className="p-6 max-h-[90vh] overflow-y-auto" title={isEdit ? t('form.editTitle') : t('form.newTitle')}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* The sessionKey key remounts the fields component per seeding
            session: the remount resets its local state (the More-details
            latch, focus one-shots, the touched map) and re-fires the amount
            input's per-open autoFocus. */}
        <TransactionFormFields key={form.sessionKey} form={form} />
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {/* Two separate, individually clickable actions (never a menu). */}
          {isEdit && transaction && (
            <div className="flex items-center gap-2">
              {onCopy && (
                <button type="button" onClick={() => onCopy(transaction)} className={secondaryButtonClass}>
                  <Copy size={13} className="inline mr-1" /> {t('form.copy')}
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(transaction)} className={destructiveButtonClass}>
                  <Trash2 size={13} className="inline mr-1" /> {t('form.delete')}
                </button>
              )}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className={secondaryButtonClass}>{t('form.cancel')}</button>
            <button type="submit" disabled={form.isSaving} className={primaryButtonClass}>
              {form.isSaving ? t('form.saving') : isEdit ? t('form.save') : t('form.add')}
            </button>
          </div>
        </div>
      </form>

      {isEdit && transaction && (
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center gap-1 mb-3">
            {DETAIL_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => form.setDetailTab(tab)}
                className={`px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-wider transition-colors ${
                  form.detailTab === tab ? 'bg-surface-hover text-text' : 'text-text-muted hover:text-text hover:bg-surface-hover'
                }`}
              >
                {t(tab === 'items' ? 'form.tabs.items' : 'form.tabs.receipts')}
              </button>
            ))}
          </div>
          {form.detailTab === 'items' && <TransactionItemsEditor transaction={transaction} />}
          {form.detailTab === 'receipts' && <TransactionAttachments transaction={transaction} />}
        </div>
      )}
    </Modal>
  )
}
