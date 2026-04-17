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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4">
      <div className="max-w-md w-full bg-surface rounded-sm border border-border p-8">
        <h1 className="text-base font-semibold text-text mb-2">Updated agreements</h1>
        <p className="text-text-muted mb-6">
          We've updated our legal documents. Please review and accept the changes to continue using Monie.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {needsTerms && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={e => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded-none border-border"
              />
              <span className="text-sm text-text">
                I accept the updated{' '}
                <Link to="/terms" target="_blank" className="text-primary hover:text-primary-hover">
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
                className="mt-1 h-4 w-4 rounded-none border-border"
              />
              <span className="text-sm text-text">
                I accept the updated{' '}
                <Link to="/privacy" target="_blank" className="text-primary hover:text-primary-hover">
                  Privacy Policy
                </Link>{' '}
                {status && `(v${status.privacy_version_required})`}
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={!canSubmit || isSubmitting}
            className="w-full py-2 px-4 bg-primary text-white rounded-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {isSubmitting ? 'Saving…' : 'Accept and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
