import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { legalApi } from '../api/client';
import type { LegalDoc } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function PrivacyPolicyPage() {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [error, setError] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    legalApi.getPrivacy().then(setDoc).catch(() => setError(true));
  }, []);

  return (
    <div className="min-h-screen bg-surface py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link to={isAuthenticated ? '/' : '/login'} className="text-sm text-primary hover:text-primary-dim">
            &larr; {isAuthenticated ? 'Back' : 'Back to login'}
          </Link>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-8" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="mb-8">
            <h1 className="font-headline font-bold text-on-surface text-3xl">Privacy Policy</h1>
            {doc && (
              <p className="mt-2 text-sm text-on-surface-variant">
                Effective date: {doc.effective_date} &middot; Version {doc.version}
              </p>
            )}
          </div>

          {error && (
            <p className="text-negative">Failed to load privacy policy. Please try again later.</p>
          )}

          {!doc && !error && (
            <p className="text-outline">Loading…</p>
          )}

          {doc && (
            <div className="prose-legal">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => (
                    <h2 className="font-headline font-bold text-on-surface text-xl mt-8 mb-3">{children}</h2>
                  ),
                  p: ({ children }) => (
                    <p className="text-on-surface-variant mb-3">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside text-on-surface-variant space-y-1 ml-4 mb-3">{children}</ul>
                  ),
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  code: ({ children }) => (
                    <code className="bg-surface-container-low px-1 rounded text-sm">{children}</code>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} className="text-primary hover:text-primary-dim">{children}</a>
                  ),
                }}
              >
                {doc.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
