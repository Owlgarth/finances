import { AlertTriangle, Ban, Lock, Search, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  message: string
  type?: 'error' | 'warning' | 'info'
  statusCode?: number
  onRetry?: () => void
}

// Literal key unions keep t(config.titleKey) type-checked against the common
// catalog (the keys are module constants, so plain `string` would widen and
// lose the typegen literal union).
type ErrorMessageTitleKey =
  | 'errorMessage.sessionExpiredTitle'
  | 'errorMessage.accessDeniedTitle'
  | 'errorMessage.notFoundTitle'
  | 'errorMessage.serverErrorTitle'
  | 'errorMessage.connectionErrorTitle'

type ErrorMessageBodyKey =
  | 'errorMessage.sessionExpiredBody'
  | 'errorMessage.accessDeniedBody'
  | 'errorMessage.notFoundBody'
  | 'errorMessage.serverErrorBody'
  | 'errorMessage.connectionErrorBody'

interface ErrorConfig {
  titleKey: ErrorMessageTitleKey
  descriptionKey: ErrorMessageBodyKey
  icon: LucideIcon
}

const errorConfigs: Record<number, ErrorConfig> = {
  401: {
    titleKey: 'errorMessage.sessionExpiredTitle',
    descriptionKey: 'errorMessage.sessionExpiredBody',
    icon: Lock,
  },
  403: {
    titleKey: 'errorMessage.accessDeniedTitle',
    descriptionKey: 'errorMessage.accessDeniedBody',
    icon: Ban,
  },
  404: {
    titleKey: 'errorMessage.notFoundTitle',
    descriptionKey: 'errorMessage.notFoundBody',
    icon: Search,
  },
  500: {
    titleKey: 'errorMessage.serverErrorTitle',
    descriptionKey: 'errorMessage.serverErrorBody',
    icon: AlertTriangle,
  },
}

const networkConfig: ErrorConfig = {
  titleKey: 'errorMessage.connectionErrorTitle',
  descriptionKey: 'errorMessage.connectionErrorBody',
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
  const { t } = useTranslation('common')
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
              {t(config.titleKey)}
            </h4>
          )}
          <p className={`${textColors[type]} text-sm`}>
            {message || (config ? t(config.descriptionKey) : undefined)}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`mt-3 px-3 py-1.5 rounded-sm text-xs font-medium font-mono uppercase tracking-wider border border-border ${buttonColors[type]} transition-colors`}
            >
              {t('errorMessage.retry')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
