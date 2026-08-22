import { legalApi } from '../api/client';
import LegalDocPage from '../components/LegalDocPage';

export default function PrivacyPolicyPage() {
  return (
    <LegalDocPage
      fetcher={legalApi.getPrivacy}
      title="Privacy Policy"
      failureText="Failed to load privacy policy. Please try again later."
    />
  );
}
