'use client';

import { useState } from 'react';
import { Flag, X, CheckCircle2, LoaderCircle } from 'lucide-react';
import { reportUser } from '@/app/social-actions';

const REASONS = [
  { id: 'spam', label: 'Spam, bot activity, or advertising' },
  { id: 'harassment', label: 'Harassment, bullying, or hate speech' },
  { id: 'impersonation', label: 'Pretending to be someone else' },
  { id: 'inappropriate', label: 'Inappropriate or violent content' },
  { id: 'other', label: 'Other violation' },
];

export default function ReportUserModal({
  userId,
  onClose,
}: {
  userId: number;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(REASONS[0].id);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await reportUser(userId, reason, details);
    setSubmitted(true);
    setLoading(false);
    setTimeout(onClose, 1400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-gray-100 dark:border-gray-700">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1.5 rounded-full" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Report received</h3>
            <p className="text-sm text-gray-500">Thanks for helping keep Hyper safe.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <Flag className="w-5 h-5" />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Report account</h2>
            </div>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label key={r.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${reason === r.id ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700'}`}>
                  <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder="Optional context"
              className="w-full text-sm p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
            />
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : 'Submit report'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
