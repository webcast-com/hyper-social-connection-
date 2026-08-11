'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Signup() {
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice]     = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Detect demo/offline mode (no database connected) so we can explain why
  // account creation is unavailable instead of surfacing a technical error.
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setDemoMode(data?.db === false))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.href = '/';
      } else {
        setError(data.error || 'Signup failed. Please try again.');
      }
    } catch {
      setError('An error occurred during signup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl flex flex-col items-center px-4 py-12 gap-8">
      {/* Hero Header with Hyper branding */}
      <div className="text-center">
        <Link href="/" className="inline-block hover:scale-105 transition-transform">
          <h1 className="text-6xl font-extrabold text-blue-600 dark:text-blue-500 tracking-tight mb-2 font-display">
            hyper
          </h1>
        </Link>
        <p className="text-gray-500 dark:text-gray-400 text-lg">Create a new account. It&apos;s quick and easy.</p>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 w-full max-w-sm">
        {demoMode && (
          <div className="mb-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl px-3 py-2.5">
            <span className="font-bold">Demo mode.</span> No database is connected, so
            account creation is disabled. Set <code className="font-mono">DATABASE_URL</code> in{' '}
            <code className="font-mono">.env.local</code> to enable sign-up (see{' '}
            <code className="font-mono">DATABASE.md</code>).
          </div>
        )}
        <form onSubmit={handleSubmit} className="w-full flex flex-col space-y-4">
          <input
            type="text"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <input
            type="password"
            placeholder="New password (at least 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />

          {notice && (
            <p className="text-green-600 dark:text-green-400 text-xs text-center bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
              {notice}
            </p>
          )}
          {error && (
            <p className="text-red-500 text-xs text-center bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || demoMode}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors mt-2 shadow-sm text-sm disabled:opacity-60"
          >
            {loading ? 'Creating Account…' : demoMode ? 'Sign-up disabled (demo)' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm border-t border-gray-200 dark:border-gray-700 pt-4">
          <Link href="/login" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
            Already have an account? Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
