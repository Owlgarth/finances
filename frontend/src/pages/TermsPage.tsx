import { useTranslation } from 'react-i18next';
import { legalApi } from '../api/client';
import LegalDocPage from '../components/LegalDocPage';

export default function TermsPage() {
  const { t } = useTranslation('dashboard');
  return (
    <LegalDocPage
      fetcher={legalApi.getTerms}
      title={t('legal.termsTitle')}
      failureText={t('legal.termsFailure')}
    />
  );
}
