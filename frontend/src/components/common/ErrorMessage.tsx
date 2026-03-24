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
    icon: 'lock',
  },
  403: {
    title: 'Access Denied',
    description: 'You do not have permission to access this resource.',
    icon: 'block',
  },
  404: {
    title: 'Not Found',
    description: 'The requested resource could not be found.',
    icon: 'search',
  },
  500: {
    title: 'Server Error',
    description: 'An unexpected error occurred. Please try again later.',
    icon: 'warning',
  },
  network: {
    title: 'Connection Error',
    description: 'Unable to connect to the server. Check your internet connection.',
    icon: 'wifi_off',
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
    error: 'bg-error-container/20',
    warning: 'bg-[#fef3c7]',
    info: 'bg-secondary-container/40',
  }

  const textColors = {
    error: 'text-error',
    warning: 'text-[#92400e]',
    info: 'text-on-secondary-container',
  }

  const buttonColors = {
    error: 'bg-error-container/40 hover:bg-error-container/60 text-error',
    warning: 'bg-[#fde68a] hover:bg-[#fcd34d] text-[#92400e]',
    info: 'bg-secondary-container hover:bg-secondary-container/80 text-on-secondary-container',
  }

  return (
    <div className={`${bgColors[type]} rounded-lg p-4 mb-4 transition-all duration-200`}>
      <div className="flex items-start">
        <span className="material-symbols-outlined text-xl mr-3 flex-shrink-0 select-none">
          {config?.icon || 'warning'}
        </span>
        <div className="flex-1">
          {config && (
            <h4 className={`font-headline font-semibold ${textColors[type]} mb-1`}>
              {config.title}
            </h4>
          )}
          <p className={`${textColors[type]} text-sm`}>
            {message || config?.description}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-bold font-mono uppercase tracking-wider ${buttonColors[type]} transition-all active:scale-[0.98] shadow-sm`}
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
