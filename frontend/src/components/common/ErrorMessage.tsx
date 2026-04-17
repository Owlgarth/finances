import { AlertTriangle, Ban, Lock, Search, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  message: string
  type?: 'error' | 'warning' | 'info'
  statusCode?: number
  onRetry?: () => void
}

interface ErrorConfig {
  title: string
  description: string
  icon: LucideIcon
}

const errorConfigs: Record<number, ErrorConfig> = {
  401: {
    title: 'Session Expired',
    description: 'Your session has expired. Please log in again.',
    icon: Lock,
  },
  403: {
    title: 'Access Denied',
    description: 'You do not have permission to access this resource.',
    icon: Ban,
  },
  404: {
    title: 'Not Found',
    description: 'The requested resource could not be found.',
    icon: Search,
  },
  500: {
    title: 'Server Error',
    description: 'An unexpected error occurred. Please try again later.',
    icon: AlertTriangle,
  },
}

const networkConfig: ErrorConfig = {
  title: 'Connection Error',
  description: 'Unable to connect to the server. Check your internet connection.',
  icon: WifiOff,
}

const bgColors = {
  error: 'bg-negative-bg',
  warning: 'bg-warning-bg',
  info: 'bg-surface-hover',
}

const textColors = {
  error: 'text-negative',
  warning: 'text-warning',
  info: 'text-text',
}

const buttonColors = {
  error: 'bg-negative/10 hover:bg-negative/20 text-negative',
  warning: 'bg-warning/10 hover:bg-warning/20 text-warning',
  info: 'bg-surface-hover hover:bg-surface-muted text-text',
}

export default function ErrorMessage({ message, type = 'error', statusCode, onRetry }: Props) {
  const isNetworkError = message.toLowerCase().includes('network') ||
                         message.toLowerCase().includes('connection') ||
                         message.toLowerCase().includes('offline')

  const config = statusCode
    ? errorConfigs[statusCode]
    : isNetworkError
      ? networkConfig
      : null

  const IconComponent = config?.icon || AlertTriangle

  return (
    <div className={`${bgColors[type]} rounded-sm p-4 mb-4 transition-colors`}>
      <div className="flex items-start">
        <IconComponent size={20} className={`mr-3 flex-shrink-0 ${textColors[type]}`} />
        <div className="flex-1">
          {config && (
            <h4 className={`font-semibold ${textColors[type]} mb-1`}>
              {config.title}
            </h4>
          )}
          <p className={`${textColors[type]} text-sm`}>
            {message || config?.description}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className={`mt-3 px-3 py-1.5 rounded-sm text-xs font-medium font-mono uppercase tracking-wider border border-border ${buttonColors[type]} transition-colors`}
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
