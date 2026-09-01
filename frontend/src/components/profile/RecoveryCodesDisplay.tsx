import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

interface Props {
  codes: string[]
  onAcknowledge?: () => void
}

export default function RecoveryCodesDisplay({ codes, onAcknowledge }: Props) {
  const { t } = useTranslation('settings')
  const [copied, setCopied] = useState(false)

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      toast.success(t('recovery.copiedToast'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('recovery.copyFailedToast'))
    }
  }

  // The downloaded .txt content stays English by policy: it is a document
  // artifact saved to disk (same rule as emails and legal text), not UI chrome.
  const handleDownload = () => {
    const content = [
      'Owlgarth Finances Recovery Codes',
      '=====================',
      '',
      'Store these codes in a safe place.',
      'Each code can only be used once.',
      '',
      ...codes.map((code, i) => `${i + 1}. ${code}`),
      '',
      `Generated on: ${new Date().toLocaleString()}`,
    ].join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'owlgarth_finances_recovery_codes.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text mb-1">{t('recovery.title')}</h3>
        <p className="text-sm text-text-muted">
          {t('recovery.body')}
        </p>
      </div>

      <div className="bg-surface-muted rounded-sm p-4">
        <div className="grid grid-cols-2 gap-2">
          {codes.map((code) => (
            <div
              key={code}
              className="bg-surface rounded-none px-3 py-2 text-center font-mono text-sm text-text tracking-wider"
            >
              {code}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopyAll}
          className="px-4 py-2 text-sm font-medium rounded-sm border border-border text-text-muted hover:bg-surface-hover hover:text-text transition-colors"
        >
          {copied ? t('recovery.copied') : t('recovery.copyAll')}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="px-4 py-2 text-sm font-medium rounded-sm border border-border text-text-muted hover:bg-surface-hover hover:text-text transition-colors"
        >
          {t('recovery.download')}
        </button>
      </div>

      {onAcknowledge && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onAcknowledge}
            className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors"
          >
            {t('recovery.acknowledge')}
          </button>
        </div>
      )}
    </div>
  )
}
