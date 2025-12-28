interface Props {
  message?: string
  size?: 'sm' | 'md' | 'lg'
  fullPage?: boolean
}

const sizeClasses = {
  sm: 'h-6 w-6 border-2',
  md: 'h-12 w-12 border-2',
  lg: 'h-16 w-16 border-4',
}

export default function Loading({ message, size = 'md', fullPage = false }: Props) {
  const content = (
    <div className="flex flex-col justify-center items-center gap-3">
      <div
        className={`animate-spin rounded-full border-blue-600 border-b-transparent ${sizeClasses[size]}`}
        role="status"
        aria-label="Loading"
      />
      {message && (
        <p className="text-sm text-gray-600">{message}</p>
      )}
    </div>
  )

  if (fullPage) {
    return (
      <div className="fixed inset-0 bg-white bg-opacity-80 flex justify-center items-center z-50">
        {content}
      </div>
    )
  }

  return (
    <div className="flex justify-center items-center py-12">
      {content}
    </div>
  )
}