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
      <p className="text-on-surface-variant mb-6 font-headline">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-4 py-2 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.10)] font-medium text-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
