import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { legalApi } from '../api/client';
import toast from 'react-hot-toast';

export default function Register() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [termsVersion, setTermsVersion] = useState('');
  const [privacyVersion, setPrivacyVersion] = useState('');

  useEffect(() => {
    Promise.all([legalApi.getTerms(), legalApi.getPrivacy()]).then(([terms, privacy]) => {
      setTermsVersion(terms.version);
      setPrivacyVersion(privacy.version);
    });
  }, []);

  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    return <Navigate to="/login" replace />;
  }

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        email,
        password,
        full_name: fullName || undefined,
        workspace_name: workspaceName,
        accepted_terms_version: termsVersion,
        accepted_privacy_version: privacyVersion,
      });
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName = "w-full bg-background border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:bg-surface focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors placeholder:text-text-muted";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-surface border border-border rounded-sm p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="font-sans font-semibold text-primary text-base tracking-tight">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Start tracking your budget today
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
              Email address *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="full-name" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
              Full name
            </label>
            <input
              id="full-name"
              name="full-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="workspace-name" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
              Workspace name *
            </label>
            <input
              id="workspace-name"
              name="workspace-name"
              type="text"
              required
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="My Budget"
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
              Password * (min 8 characters)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
              Confirm password *
            </label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClassName}
            />
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-start gap-2">
              <input
                id="accept-terms"
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="accept-terms" className="text-sm text-text-muted">
                I accept the{' '}
                <Link to="/terms" className="text-primary hover:text-primary-hover">Terms of Service</Link>
                {' '}*
              </label>
            </div>
            <div className="flex items-start gap-2">
              <input
                id="accept-privacy"
                type="checkbox"
                required
                checked={acceptedPrivacy}
                onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="accept-privacy" className="text-sm text-text-muted">
                I accept the{' '}
                <Link to="/privacy" className="text-primary hover:text-primary-hover">Privacy Policy</Link>
                {' '}*
              </label>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !acceptedTerms || !acceptedPrivacy || !termsVersion || !privacyVersion}
              className="w-full flex justify-center py-2 px-3 text-xs font-medium rounded-sm text-white bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/login"
              className="font-medium text-primary hover:text-primary-hover"
            >
              Already have an account? Sign in
            </Link>
          </div>

          <div className="text-center text-xs text-text-muted">
            <Link to="/privacy" className="hover:text-text">Privacy Policy</Link>
            {' · '}
            <Link to="/terms" className="hover:text-text">Terms of Service</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
