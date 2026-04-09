import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login, verify2FA, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await login({ email, password });
      if (result?.requires_2fa && result.temp_token) {
        setRequires2FA(true);
        setTempToken(result.temp_token);
      }
    } catch {
      // Error already displayed by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await verify2FA(tempToken, twoFACode);
    } catch {
      // Error already displayed by AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setRequires2FA(false);
    setTempToken('');
    setTwoFACode('');
    setUseRecoveryCode(false);
    setIsSubmitting(false);
  };

  const inputClassName = "w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all";

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-surface-container-lowest rounded-xl p-8 w-full max-w-md" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="text-center mb-8">
          <h2 className="font-headline font-black text-primary text-3xl tracking-tight">
            Monie
          </h2>
          {!requires2FA ? (
            <p className="mt-2 text-sm text-on-surface-variant">
              Sign in to your account
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm font-medium text-on-surface">
                Two-Factor Authentication
              </p>
              <p className="mt-1 text-sm text-on-surface-variant">
                Enter the code from your authenticator app
              </p>
            </>
          )}
        </div>

        {!requires2FA ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="email" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">
                Email address
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
                placeholder="Email address"
              />
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClassName}
                placeholder="Password"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2 px-4 text-sm font-medium rounded-lg text-on-primary bg-gradient-to-br from-primary to-primary-dim hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </button>
            </div>

            {!import.meta.env.VITE_DEMO_MODE && (
              <div className="text-center">
                <Link
                  to="/register"
                  className="font-medium text-primary hover:text-primary-dim"
                >
                  Don't have an account? Register
                </Link>
              </div>
            )}

            <div className="text-center text-xs text-outline">
              <Link to="/privacy" className="hover:text-on-surface-variant">Privacy Policy</Link>
              {' · '}
              <Link to="/terms" className="hover:text-on-surface-variant">Terms of Service</Link>
            </div>
          </form>
        ) : (
          <form className="space-y-6" onSubmit={handle2FAVerify}>
            <div className="mb-4">
              <label htmlFor="2fa-code" className="block font-mono text-[9px] uppercase tracking-widest text-outline mb-1">
                {useRecoveryCode ? 'Recovery code' : 'Verification code'}
              </label>
              <input
                id="2fa-code"
                name="2fa-code"
                type="text"
                autoComplete="one-time-code"
                required
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value)}
                className={inputClassName}
                placeholder={useRecoveryCode ? 'XXXX-XXXX' : '000000'}
                maxLength={useRecoveryCode ? 9 : 6}
                autoFocus
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting || !twoFACode}
                className="w-full flex justify-center py-2 px-4 text-sm font-medium rounded-lg text-on-primary bg-gradient-to-br from-primary to-primary-dim hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Verifying...' : 'Verify'}
              </button>
            </div>

            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={() => {
                  setUseRecoveryCode(!useRecoveryCode);
                  setTwoFACode('');
                }}
                className="text-sm text-primary hover:text-primary-dim"
              >
                {useRecoveryCode ? 'Use authenticator code' : 'Use recovery code'}
              </button>
              <div>
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-sm text-on-surface-variant hover:text-on-surface"
                >
                  &larr; Back to sign in
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
