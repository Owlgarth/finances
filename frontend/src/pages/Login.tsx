import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await login({ email, password });
    } catch (error) {
      console.error(error)
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="bg-surface-container-lowest rounded-xl p-8 w-full max-w-md" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="text-center mb-8">
          <h2 className="font-headline font-black text-primary text-3xl tracking-tight">
            Monie
          </h2>
          <p className="mt-2 text-sm text-on-surface-variant">
            Sign in to your account
          </p>
        </div>

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
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
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
              className="w-full bg-surface-container-highest border-none rounded-lg px-3 py-2 font-mono text-sm text-on-surface focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container focus:outline-none transition-all"
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
      </div>
    </div>
  );
}
