import { useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CircleCheck } from 'lucide-react'
import { authApi } from '../../api/client'

interface Props {
  verified: boolean
  email: string
}

export default function EmailVerificationBadge({ verified, email }: Props) {
  const { t } = useTranslation('settings')
  const [isResending, setIsResending] = useState(false)

  const handleResend = async () => {
    setIsResending(true)
    try {
      await authApi.resendVerification(email)
      toast.success(t('emailBadge.sent'))
    } catch {
      toast.error(t('emailBadge.failed'))
    } finally {
      setIsResending(false)
    }
  }

  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-positive">
        <CircleCheck size={14} className="text-positive" />
        {t('emailBadge.verified')}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-warning">
        <AlertTriangle size={14} className="text-warning" />
        {t('emailBadge.notVerified')}
      </span>
      <button
        type="button"
        onClick={handleResend}
        disabled={isResending}
        className="text-primary hover:text-primary-hover text-xs font-medium disabled:opacity-50"
      >
        {isResending ? t('emailBadge.sending') : t('emailBadge.resend')}
      </button>
    </span>
  )
}
