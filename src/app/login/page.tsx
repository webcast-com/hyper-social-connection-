'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [demoMode, setDemoMode] = useState(false);

  // Detect demo/offline mode (no database connected) so we can explain why
  // sign-in is unavailable instead of surfacing a technical 503 error.
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setDemoMode(data?.db === false))
      .catch(() => {});
  }, []);

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
      const data = await res.json().catch(() => ({}));
      setError(data?.error || 'Invalid email or password.');
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
          {demoMode && (
            <div className="mb-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl px-3 py-2.5">
              <span className="font-bold">Demo mode.</span> No database is connected, so
              accounts are disabled and you&apos;re browsing the live demo as Alex.
              Set <code className="font-mono">DATABASE_URL</code> in <code className="font-mono">.env.local</code> to
              enable sign-in (see <code className="font-mono">DATABASE.md</code>).
            </div>
          )}
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
              disabled={loading || demoMode}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors shadow-sm disabled:opacity-60 text-sm"
            >
              {loading ? 'Logging in…' : demoMode ? 'Sign-in disabled (demo)' : 'Log In'}
            </button>
          </form>

          <div className="text-center mt-3">
            <Link href="/login" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Forgot password?
            </Link>
          </div>

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
