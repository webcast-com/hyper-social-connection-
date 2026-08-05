'use client';

import { useState } from 'react';
import Link from 'next/link';

const DEMO_USERS = [
  { name: 'Alex Johnson', email: 'alex@demo.com', emoji: '📸', role: 'Photographer & Traveler' },
  { name: 'Maya Patel',   email: 'maya@demo.com', emoji: '🎨', role: 'Digital Artist' },
  { name: 'Jordan Rivera',email: 'jordan@demo.com',emoji: '💪', role: 'Fitness Coach' },
  { name: 'Sophie Chen',  email: 'sophie@demo.com',emoji: '💻', role: 'Full-Stack Dev' },
  { name: 'Marcus Williams',email:'marcus@demo.com',emoji:'🎸', role: 'Musician & Filmmaker' },
  { name: 'Emma Davis',   email: 'emma@demo.com', emoji: '📚', role: 'Book Lover' },
  { name: 'Liam Nguyen',  email: 'liam@demo.com', emoji: '🍳', role: 'Chef in Training' },
  { name: 'Zara Thompson',email: 'zara@demo.com', emoji: '🌸', role: 'Fashion Blogger' },
];

export default function Login() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const doLogin = async (e: string, p: string) => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: e, password: p }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      setError('Invalid email or password.');
      setLoading(false);
    }
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    await doLogin(email, password);
  };

  const loginAsDemo = async (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('demo1234');
    await doLogin(demoEmail, 'demo1234');
  };

  return (
    <div className="w-full max-w-4xl flex flex-col items-center px-4 py-8 gap-8">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-6xl font-extrabold text-blue-600 tracking-tight mb-2">hyper</h1>
        <p className="text-gray-500 text-lg">Connect with friends and the world around you.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 w-full items-start justify-center">
        {/* Login Card */}
        <div className="bg-white p-6 rounded-2xl shadow-lg w-full max-w-sm">
          <form onSubmit={handleSubmit} className="flex flex-col space-y-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Logging in…' : 'Log In'}
            </button>
          </form>
          <div className="text-center mt-3">
            <span className="text-sm text-blue-600 hover:underline cursor-pointer">Forgot password?</span>
          </div>
          <div className="border-t border-gray-200 my-4" />
          <Link
            href="/signup"
            className="block text-center bg-green-500 text-white font-bold py-3 rounded-lg hover:bg-green-600 transition-colors"
          >
            Create new account
          </Link>
        </div>

        {/* Demo Profiles Panel */}
        <div className="bg-white p-6 rounded-2xl shadow-lg w-full max-w-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🚀</span>
            <h2 className="font-bold text-lg text-gray-800">Try a Demo Profile</h2>
          </div>
          <p className="text-gray-500 text-xs mb-4">One-click login — password is <code className="bg-gray-100 px-1 rounded">demo1234</code></p>

          <div className="grid grid-cols-1 gap-2 max-h-[360px] overflow-y-auto pr-1">
            {DEMO_USERS.map(u => (
              <button
                key={u.email}
                onClick={() => loginAsDemo(u.email)}
                disabled={loading}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-blue-50 hover:border-blue-200 transition-all text-left group disabled:opacity-60"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full flex items-center justify-center text-xl shadow-sm shrink-0">
                  {u.emoji}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-gray-800 group-hover:text-blue-700 truncate">{u.name}</div>
                  <div className="text-xs text-gray-400 truncate">{u.role}</div>
                </div>
                <span className="ml-auto text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium shrink-0">Login →</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
