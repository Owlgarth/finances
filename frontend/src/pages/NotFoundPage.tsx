import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { primaryButtonClass } from '../components/common/formStyles'

export default function NotFoundPage() {
  const { t } = useTranslation('common')
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="text-lg font-semibold text-text">{t('notFound.title')}</h1>
      <p className="mt-2 text-sm text-text-muted">
        {t('notFound.body')}
      </p>
      <Link to="/" className={`mt-6 ${primaryButtonClass}`}>
        {t('notFound.cta')}
      </Link>
    </div>
  )
}
