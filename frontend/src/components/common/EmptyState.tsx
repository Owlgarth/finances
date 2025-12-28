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
      <p className="text-gray-500 mb-4">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
