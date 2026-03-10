import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { legalApi } from '../api/client';
import type { LegalDoc } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function TermsPage() {
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [error, setError] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    legalApi.getTerms().then(setDoc).catch(() => setError(true));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link to={isAuthenticated ? '/' : '/login'} className="text-sm text-blue-600 hover:text-blue-500">
            &larr; {isAuthenticated ? 'Back' : 'Back to login'}
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Terms of Service</h1>
            {doc && (
              <p className="mt-2 text-sm text-gray-500">
                Effective date: {doc.effective_date} &middot; Version {doc.version}
              </p>
            )}
          </div>

          {error && (
            <p className="text-red-600">Failed to load terms of service. Please try again later.</p>
          )}

          {!doc && !error && (
            <p className="text-gray-400">Loading…</p>
          )}

          {doc && (
            <div className="prose-legal">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{children}</h2>
                  ),
                  p: ({ children }) => (
                    <p className="text-gray-700 mb-3">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside text-gray-700 space-y-1 ml-4 mb-3">{children}</ul>
                  ),
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  a: ({ href, children }) => (
                    <a href={href} className="text-blue-600 hover:underline">{children}</a>
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
