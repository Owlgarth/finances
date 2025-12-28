interface Props {
  message: string
  type?: 'error' | 'warning' | 'info'
  statusCode?: number
  onRetry?: () => void
}

const errorConfigs = {
  401: {
    title: 'Session Expired',
    description: 'Your session has expired. Please log in again.',
    icon: '🔒',
  },
  403: {
    title: 'Access Denied',
    description: 'You do not have permission to access this resource.',
    icon: '🚫',
  },
  404: {
    title: 'Not Found',
    description: 'The requested resource could not be found.',
    icon: '🔍',
  },
  500: {
    title: 'Server Error',
    description: 'An unexpected error occurred. Please try again later.',
    icon: '⚠️',
  },
  network: {
    title: 'Connection Error',
    description: 'Unable to connect to the server. Check your internet connection.',
    icon: '📡',
  },
}

export default function ErrorMessage({ message, type = 'error', statusCode, onRetry }: Props) {
  const isNetworkError = message.toLowerCase().includes('network') ||
                         message.toLowerCase().includes('connection') ||
                         message.toLowerCase().includes('offline')

  const config = statusCode
    ? errorConfigs[statusCode as keyof typeof errorConfigs]
    : isNetworkError
      ? errorConfigs.network
      : null

  const bgColors = {
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200',
  }

  const textColors = {
    error: 'text-red-800',
    warning: 'text-yellow-800',
    info: 'text-blue-800',
  }

  const buttonColors = {
    error: 'bg-red-100 hover:bg-red-200 text-red-800',
    warning: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800',
    info: 'bg-blue-100 hover:bg-blue-200 text-blue-800',
  }

  return (
    <div className={`${bgColors[type]} border rounded-lg p-4 mb-4`}>
      <div className="flex items-start">
        <span className="text-xl mr-3 flex-shrink-0">
          {config?.icon || '⚠️'}
        </span>
        <div className="flex-1">
          {config && (
            <h4 className={`font-semibold ${textColors[type]} mb-1`}>
              {config.title}
            </h4>
          )}
          <p className={textColors[type]}>
            {message || config?.description}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className={`mt-3 px-4 py-2 rounded-md text-sm font-medium ${buttonColors[type]} transition-colors`}
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}