import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, CircleCheck } from 'lucide-react'
import { authApi } from '../../api/client'

interface Props {
  verified: boolean
  email: string
}

export default function EmailVerificationBadge({ verified, email }: Props) {
  const [isResending, setIsResending] = useState(false)

  const handleResend = async () => {
    setIsResending(true)
    try {
      await authApi.resendVerification(email)
      toast.success('Verification email sent!')
    } catch {
      toast.error('Failed to send verification email')
    } finally {
      setIsResending(false)
    }
  }

  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-positive">
        <CircleCheck size={14} className="text-positive" />
        Verified
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-flex items-center gap-1.5 text-warning">
        <AlertTriangle size={14} className="text-warning" />
        Not verified
      </span>
      <button
        type="button"
        onClick={handleResend}
        disabled={isResending}
        className="text-primary hover:text-primary-hover text-xs font-medium disabled:opacity-50"
      >
        {isResending ? 'Sending...' : 'Resend'}
      </button>
    </span>
  )
}
