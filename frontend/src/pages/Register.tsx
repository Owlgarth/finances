import { useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { legalApi } from '../api/client';
import { authInputClass } from '../components/common/formStyles';
import MultiSelect from '../components/common/MultiSelect';
import { useAuth } from '../contexts/AuthContext';
import { usePublicCurrencyCatalog, DEFAULT_CURRENCY_CODES } from '../hooks/usePublicCurrencyCatalog';

export default function Register() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [currencyCodes, setCurrencyCodes] = useState<string[]>([...DEFAULT_CURRENCY_CODES]);
  const [startWithSampleData, setStartWithSampleData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [termsVersion, setTermsVersion] = useState('');
  const [privacyVersion, setPrivacyVersion] = useState('');

  const { options: currencyOptions, isLoading: currenciesLoading, isError: currenciesError } =
    usePublicCurrencyCatalog();

  useEffect(() => {
    const loadLegalVersions = async () => {
      try {
        const [terms, privacy] = await Promise.all([legalApi.getTerms(), legalApi.getPrivacy()]);
        setTermsVersion(terms.version);
        setPrivacyVersion(privacy.version);
      } catch {
        // Versions stay empty; the submit button remains disabled until they load.
      }
    };
    loadLegalVersions();
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

    if (currencyCodes.length === 0) {
      toast.error('Select at least one currency');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        email,
        password,
        full_name: fullName || undefined,
        workspace_name: workspaceName,
        currency_codes: currencyCodes,
        start_with_sample_data: startWithSampleData,
        accepted_terms_version: termsVersion,
        accepted_privacy_version: privacyVersion,
      });
    } catch {
      // Error already displayed by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName = `${authInputClass} placeholder:text-text-muted`;

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
            <label htmlFor="currency-codes" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">
              Currencies *
            </label>
            {currenciesLoading ? (
              <div className="h-10 w-full bg-surface-muted animate-pulse" />
            ) : (
              <MultiSelect
                id="currency-codes"
                values={currencyCodes}
                onChange={setCurrencyCodes}
                options={currencyOptions}
                placeholder="Select currencies"
                searchable
                mono
                variant="auth"
              />
            )}
            {currencyCodes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {/* Selection-order chips; first = Main account currency.
                    Keep in sync with CreateWorkspaceForm's copy (extract into a
                    shared component at a third consumer). */}
                {currencyCodes.map((code, i) => (
                  <span
                    key={code}
                    className="inline-flex items-center px-2 py-0.5 border border-border rounded-sm font-mono text-[10px] font-medium uppercase tracking-wider bg-surface text-text select-none"
                  >
                    {code}
                    {i === 0 && <span className="ml-1.5 text-text-muted">Main</span>}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-text-muted leading-relaxed">
              {currenciesError
                ? "Couldn't load all currencies - your selection still works."
                : 'The first currency becomes your Main account. You can enable more later.'}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={startWithSampleData}
              onChange={(e) => setStartWithSampleData(e.target.checked)}
            />
            Start with sample data (example accounts and transactions)
          </label>

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
