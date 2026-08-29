import { useState, useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, Loader2 } from 'lucide-react';
import { legalApi } from '../api/client';
import { authInputClass } from '../components/common/formStyles';
import CurrencySetField from '../components/currencies/CurrencySetField';
import { useAuth } from '../contexts/AuthContext';
import { PRE_AUTH_CURRENCIES } from '../utils/currencies';

export default function Register() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [currencyCodes, setCurrencyCodes] = useState<string[]>(['PLN']);
  const [startWithSampleData, setStartWithSampleData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [termsVersion, setTermsVersion] = useState('');
  const [privacyVersion, setPrivacyVersion] = useState('');

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

  const [stage, setStage] = useState(0);

  const panelRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  // One-shot flag set in handleSubmit's catch; the isSubmitting effect below
  // consumes it to return focus to the submit button after the failed submit's
  // form restore. Reading/writing a ref (never setState) keeps the effect
  // lint-quiet under react-hooks/set-state-in-effect.
  const failedSubmitRef = useRef(false);

  // Frozen for the duration of a submit: the checkbox feeding the conditional
  // entry is unmounted by the panel swap, so the list cannot change mid-flight.
  const setupStages = startWithSampleData
    ? [
        'Creating your account',
        'Setting up your workspace',
        'Preparing your budget',
        'Adding sample data',
        'Finishing up',
      ]
    : ['Creating your account', 'Setting up your workspace', 'Preparing your budget', 'Finishing up'];

  // Panel takeover: focus the panel (DOM mutation only) and advance the stage
  // every 1200ms while the request is in flight. setState appears ONLY inside
  // the interval callback - never synchronously in the effect body - so this
  // adds zero set-state-in-effect warnings. Stages are pure timers, identical
  // on every error path: no backend-state leak through stage count or timing.
  useEffect(() => {
    if (!isSubmitting) return;
    panelRef.current?.focus();
    const timer = setInterval(() => {
      setStage((s) => Math.min(s + 1, setupStages.length - 1));
    }, 1200);
    return () => clearInterval(timer);
  }, [isSubmitting, setupStages.length]);

  // Error restore: when isSubmitting flips back to false after a failed
  // submit, the form (and submit button) has re-committed, so the ref is live
  // again and focus lands cleanly. On success the component unmounts
  // (navigate inside AuthContext.register) and this is a harmless no-op.
  useEffect(() => {
    if (!isSubmitting && failedSubmitRef.current) {
      failedSubmitRef.current = false;
      submitButtonRef.current?.focus();
    }
  }, [isSubmitting]);

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

    if (currencyCodes.length === 0) return toast.error('Select at least one currency');

    setIsSubmitting(true);
    setStage(0);

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
      failedSubmitRef.current = true;
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName = `${authInputClass} placeholder:text-text-muted`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-surface border border-border rounded-sm p-8 w-full max-w-md">
        {isSubmitting ? (
          <div ref={panelRef} tabIndex={-1} className="outline-none">
            <div className="text-center mb-8">
              <h2 className="font-sans font-semibold text-primary text-base tracking-tight">
                Setting up your workspace
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                This may take a few seconds
              </p>
            </div>

            {/* Static announcement, rendered once on takeover. Per-stage flips
                must NOT announce, so the step list stays outside any live
                region. */}
            <span className="sr-only" role="status" aria-live="polite">
              Setting up your workspace - this may take a moment
            </span>

            <ol className="space-y-3">
              {setupStages.map((label, index) => {
                const isComplete = index < stage;
                const isActive = index === stage;
                return (
                  <li
                    key={label}
                    className={`flex items-center gap-2 text-sm ${
                      isActive ? 'text-text font-medium' : isComplete ? 'text-text font-normal' : 'text-text-muted'
                    }`}
                  >
                    <div className="w-3.5 flex-shrink-0 flex items-center justify-center">
                      {isComplete ? (
                        <Check size={14} className="text-positive" />
                      ) : isActive ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : null}
                    </div>
                    <span>{label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <>
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

              <CurrencySetField
                value={currencyCodes}
                onChange={setCurrencyCodes}
                currencies={PRE_AUTH_CURRENCIES}
                primaryLabel="Main account"
                placeholder="Select currencies"
              />

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
                  ref={submitButtonRef}
                  type="submit"
                  disabled={isSubmitting || !acceptedTerms || !acceptedPrivacy || !termsVersion || !privacyVersion}
                  className="w-full flex justify-center py-2 px-3 text-xs font-medium rounded-sm text-white bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create account
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
          </>
        )}
      </div>
    </div>
  );
}
