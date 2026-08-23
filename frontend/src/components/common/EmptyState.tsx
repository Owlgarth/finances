import type { ReactNode } from 'react'

interface Props {
  message: string
  /** Decorative icon above the heading (design/patterns.md §2: Lucide,
      48px, strokeWidth 1.5, text-text-muted/30 — style set by the caller). */
  icon?: ReactNode
  /** Semibold heading above the message (design/patterns.md §2). */
  heading?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ message, icon, heading, action }: Props) {
  return (
    <div className="text-center py-12">
      {icon && <div className="flex justify-center mb-4">{icon}</div>}
      {heading && <h3 className="text-sm font-semibold text-text-muted mb-1.5">{heading}</h3>}
      <p className="text-text-muted mb-6 font-sans">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
