import { Link } from 'react-router-dom'
import { primaryButtonClass } from '../components/common/formStyles'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-lg font-semibold text-text">Page not found</h1>
      <p className="mt-2 text-sm text-text-muted">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link to="/" className={`mt-6 ${primaryButtonClass}`}>
        Go to Dashboard
      </Link>
    </div>
  )
}
