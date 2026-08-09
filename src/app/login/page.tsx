'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { signInWithOAuth } from '@/lib/oauth';

/** Reads the OAuth failure flag from the URL. Client-only. */
function getOAuthRedirectError(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('error') === 'oauth_failed'
    ? 'OAuth sign-in failed. Please try again or use email and password.'
    : '';
}

function subscribeNoop() {
  return () => {};
}

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const oauthRedirectError = useSyncExternalStore(subscribeNoop, getOAuthRedirectError, () => '');
  const [oauthError, setOauthError] = useState('');

  const startOAuth = async (provider: 'google' | 'github') => {
    setOauthError('');
    setError('');
    try {
      await signInWithOAuth(provider);
    } catch (err: any) {
      setOauthError(err?.message || 'OAuth sign-in is unavailable.');
    }
  };

  const doLogin = async (e: string, p: string) => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: e, password: p }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      window.location.assign('/');
    } else {
      setError('Invalid email or password.');
      setLoading(false);
    }
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    await doLogin(email, password);
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
        <p className="text-gray-500 dark:text-gray-400 text-lg">Connect with friends, share stories, and explore communities.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 w-full items-start justify-center">
        {/* Login Card */}
        <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 w-full max-w-sm">
          <form onSubmit={handleSubmit} className="flex flex-col space-y-3.5">
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
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            {error && <p className="text-red-500 text-xs text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow-sm disabled:opacity-60 text-sm"
            >
              {loading ? 'Logging in…' : 'Log In'}
            </button>
          </form>

          <div className="text-center mt-3">
            <Link href="/login" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Forgot password?
            </Link>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 my-4" />

          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">or continue with</span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => startOAuth('google')}
              disabled={loading}
              className="flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.86Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A11.99 11.99 0 0 0 12 24Z" />
                <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.28a12 12 0 0 0 0 10.74l3.99-3.09Z" />
                <path fill="#EA4335" d="M12 4.76c1.76 0 3.35.6 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 11.99 11.99 0 0 0 1.28 6.63l3.99 3.09C6.22 6.87 8.87 4.76 12 4.76Z" />
              </svg>
              Google
            </button>
            <button
              type="button"
              onClick={() => startOAuth('github')}
              disabled={loading}
              className="flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl py-2.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-60 shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.1 11.1 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.7 5.38-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
              GitHub
            </button>
          </div>

          {oauthRedirectError && (
            <p className="text-red-500 text-xs text-center mb-3">{oauthRedirectError}</p>
          )}
          {oauthError && (
            <p className="text-red-500 text-xs text-center mb-3">{oauthError}</p>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 my-4" />

          <Link
            href="/signup"
            className="block text-center bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors text-sm shadow-sm"
          >
            Create new account
          </Link>
        </div>
      </div>
    </div>
  );
}
