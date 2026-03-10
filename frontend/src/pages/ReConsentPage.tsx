import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { ConsentStatus } from '../types';
import toast from 'react-hot-toast';

export default function ReConsentPage() {
  const navigate = useNavigate();
  const { checkConsentStatus } = useAuth();
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    authApi.getConsentStatus().then(setStatus).catch(() => {
      toast.error('Failed to load consent status');
    });
  }, []);

  const needsTerms = status ? !status.terms_current : false;
  const needsPrivacy = status ? !status.privacy_current : false;

  const canSubmit =
    (!needsTerms || acceptedTerms) &&
    (!needsPrivacy || acceptedPrivacy);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (needsTerms && status) {
        await authApi.grantConsent('terms_of_service', status.terms_version_required);
      }
      if (needsPrivacy && status) {
        await authApi.grantConsent('privacy_policy', status.privacy_version_required);
      }
      toast.success('Thank you for accepting the updated documents');
      await checkConsentStatus();
      navigate('/');
    } catch {
      toast.error('Failed to record consent. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Updated agreements</h1>
        <p className="text-gray-600 mb-6">
          We've updated our legal documents. Please review and accept the changes to continue using Monie.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsTerms && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={e => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                I accept the updated{' '}
                <Link to="/terms" target="_blank" className="text-blue-600 hover:underline">
                  Terms of Service
                </Link>{' '}
                {status && `(v${status.terms_version_required})`}
              </span>
            </label>
          )}

          {needsPrivacy && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={e => setAcceptedPrivacy(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">
                I accept the updated{' '}
                <Link to="/privacy" target="_blank" className="text-blue-600 hover:underline">
                  Privacy Policy
                </Link>{' '}
                {status && `(v${status.privacy_version_required})`}
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="w-full py-2 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isSubmitting ? 'Saving…' : 'Accept and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
