'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, LoaderCircle, Camera, MessageCircle, Users } from 'lucide-react';

const FEATURES = [
  { icon: Camera,        text: 'Share posts, stories and photos' },
  { icon: MessageCircle, text: 'Chat with friends in real time' },
  { icon: Users,         text: 'Join communities that get you' },
];

export default function Login() {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [usernameMode, setUsernameMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [demoMode, setDemoMode]   = useState(false);
  const [healthKnown, setHealthKnown] = useState(false);

  // Detect demo/offline mode (no database connected) so we can explain why
  // sign-in is unavailable instead of surfacing a technical 503 error.
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => { setDemoMode(data?.db === false); setHealthKnown(true); })
      .catch(() => setHealthKnown(true));
  }, []);

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setLoading(true);
    setError('');
    const endpoint = usernameMode ? '/api/auth/signup' : '/api/auth/login';
    const payload = usernameMode ? { username: email, password } : { email, password };
    const res = await fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      window.location.assign('/');
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data?.error || (usernameMode ? 'Could not create account.' : 'Invalid email/username or password.'));
      setLoading(false);
    }
  };

  const inputCls =
    'w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 ' +
    'text-gray-900 dark:text-gray-100 text-sm rounded-xl pl-10 pr-10 py-3 ' +
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-4xl">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden grid md:grid-cols-2">
        {/* ── Brand panel ─────────────────────────────────────────────── */}
        <div className="relative bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white flex flex-col overflow-hidden">
          {/* Decorative circle */}
          <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-white/10" aria-hidden />

          {/* The community-and-scores artwork from the share image: the fans and
              a live score card, fading into the panel below. The picture's
              people are on its right, so the logo has the quiet left side. */}
          <div className="relative h-40 shrink-0 sm:h-60">
            <div
              className="absolute inset-0 bg-no-repeat bg-[length:150%_auto] bg-[position:100%_40%] [mask-image:linear-gradient(to_bottom,black_66%,transparent)]"
              style={{ backgroundImage: 'url(/hyper-community.webp)' }}
              aria-hidden
            />
            <div className="absolute inset-0 bg-gradient-to-br from-blue-800/95 via-blue-700/35 to-transparent" aria-hidden />
            <Link href="/" className="absolute left-8 top-8 inline-block hover:scale-105 transition-transform sm:left-10 sm:top-10">
              <img src="/logo-wordmark-white.svg" alt="Hyper" width={651} height={242} className="h-11 sm:h-14 w-auto select-none drop-shadow-md" draggable={false} />
            </Link>
          </div>

          <div className="relative flex flex-1 flex-col justify-between px-8 pb-8 pt-1 sm:px-10 sm:pb-10">
            <p className="text-blue-100 text-sm sm:text-base leading-relaxed">
              Brings fans, athletes, teams, influencers, and brands into one shared experience — to connect, contribute, and grow together.
            </p>

            <ul className="mt-6 space-y-4 sm:mt-8">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm">
                  <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="text-blue-50">{text}</span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-xs text-blue-200/80 sm:mt-8">
              Made for people who post, chat and vibe. 💙
            </p>
          </div>
        </div>

        {/* ── Form panel ──────────────────────────────────────────────── */}
        <div className="p-8 sm:p-10">
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">Welcome back</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Log in to your hyper account to continue.
          </p>

          {demoMode && (
            <div className="mt-5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs rounded-xl px-3.5 py-3 leading-relaxed">
              <span className="font-bold">Demo mode.</span> No database is connected, so accounts
              are disabled and you&apos;re browsing the live demo as Alex. Set{' '}
              <code className="font-mono">DATABASE_URL</code> in <code className="font-mono">.env.local</code>{' '}
              to enable sign-in (see <code className="font-mono">DATABASE.md</code>).
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col space-y-4">
            <div className="relative">
              <Mail className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={usernameMode ? 'Choose a username' : 'Email or username'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete={usernameMode ? 'username' : 'email'}
                className={inputCls}
              />
            </div>

            <div className="relative">
              <Lock className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-xs rounded-xl px-3.5 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || demoMode}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors shadow-sm text-sm flex items-center justify-center gap-2"
            >
              {loading && <LoaderCircle className="w-4 h-4 animate-spin" />}
              {loading ? 'Logging in…' : demoMode ? 'Sign-in disabled (demo)' : 'Log In'}
            </button>
          </form>

          <div className="text-center mt-3 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => { setUsernameMode((v) => !v); setError(''); }}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {usernameMode ? 'Back to Sign In' : 'Quick sign up with username & password'}
            </button>
            <Link href="/login" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Forgot password?
            </Link>
          </div>

          {healthKnown && !demoMode && (
            <div className="mt-4 text-[11px] text-gray-400 dark:text-gray-500 text-center leading-relaxed">
              Fresh database? Seeded demo account: <span className="font-mono">alex@example.com</span> ·{' '}
              <span className="font-mono">changeme123</span>
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700 mt-6 pt-5 text-center text-sm text-gray-500 dark:text-gray-400">
            New to hyper?{' '}
            <Link href="/signup" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
              Create an account
            </Link>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
