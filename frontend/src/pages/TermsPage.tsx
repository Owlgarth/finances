import { legalApi } from '../api/client';
import LegalDocPage from '../components/LegalDocPage';

export default function TermsPage() {
  return (
    <LegalDocPage
      fetcher={legalApi.getTerms}
      title="Terms of Service"
      failureText="Failed to load terms of service. Please try again later."
    />
  );
}
