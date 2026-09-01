import { useTranslation } from 'react-i18next';
import { legalApi } from '../api/client';
import LegalDocPage from '../components/LegalDocPage';

export default function PrivacyPolicyPage() {
  const { t } = useTranslation('dashboard');
  return (
    <LegalDocPage
      fetcher={legalApi.getPrivacy}
      title={t('legal.privacyTitle')}
      failureText={t('legal.privacyFailure')}
    />
  );
}
