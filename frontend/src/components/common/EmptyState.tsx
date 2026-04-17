interface Props {
  message: string
  action?: {
    label: string
    onClick: () => void
  }
}

export default function EmptyState({ message, action }: Props) {
  return (
    <div className="text-center py-12">
      <p className="text-text-muted mb-6 font-sans">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
