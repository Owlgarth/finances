import { useState } from 'react'
import toast from 'react-hot-toast'

interface Props {
  codes: string[]
  onAcknowledge?: () => void
  showAcknowledge?: boolean
}

export default function RecoveryCodesDisplay({ codes, onAcknowledge, showAcknowledge }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      toast.success('Recovery codes copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy codes')
    }
  }

  const handleDownload = () => {
    const content = [
      'Denarly Recovery Codes',
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
    link.download = 'denarly_recovery_codes.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text mb-1">Recovery Codes</h3>
        <p className="text-sm text-text-muted">
          Save these codes in a safe place. You will not be able to see them again.
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
          {copied ? 'Copied!' : 'Copy All Codes'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="px-4 py-2 text-sm font-medium rounded-sm border border-border text-text-muted hover:bg-surface-hover hover:text-text transition-colors"
        >
          Download Codes
        </button>
      </div>

      {showAcknowledge && onAcknowledge && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onAcknowledge}
            className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors"
          >
            I've Saved My Codes
          </button>
        </div>
      )}
    </div>
  )
}
