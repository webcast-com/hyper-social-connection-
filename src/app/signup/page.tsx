'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    setError('');
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data.requiresEmailConfirmation) {
        // Supabase Auth with email confirmation enabled.
        setNotice('Account created! Check your email to confirm your address, then log in.');
      } else {
        window.location.href = '/';
      }
    } else {
      setError(data.error || 'Signup failed');
    }
  };

  return (
    <div className="bg-white p-8 rounded-lg shadow-md w-96 flex flex-col items-center">
      <h1 className="text-4xl font-bold text-blue-600 mb-2">hyper</h1>
      <p className="text-gray-600 mb-6 text-center text-sm">Create a new account. It&apos;s quick and easy.</p>
      <form onSubmit={handleSubmit} className="w-full flex flex-col space-y-4">
        <input
          type="text"
          placeholder="Full Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {notice && <p className="text-green-600 text-sm text-center bg-green-50 border border-green-100 rounded-md px-3 py-2">{notice}</p>}
        {error && <p className="text-red-500 text-sm text-center bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</p>}
        <button
          type="submit"
          className="bg-green-500 text-white font-bold py-3 rounded-md hover:bg-green-600 transition-colors mt-2"
        >
          Sign Up
        </button>
      </form>
      <div className="mt-6 text-sm">
        <Link href="/login" className="text-blue-600 hover:underline">
          Already have an account?
        </Link>
      </div>
    </div>
  );
}