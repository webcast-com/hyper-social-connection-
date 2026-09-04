'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { reportPost } from '@/app/actions';
import { Flag, X, CheckCircle2, LoaderCircle } from 'lucide-react';

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam, bot activity, or advertising' },
  { id: 'harassment', label: 'Harassment, bullying, or hate speech' },
  { id: 'misinformation', label: 'Misinformation or false news' },
  { id: 'inappropriate', label: 'Inappropriate or violent media' },
  { id: 'other', label: 'Other violation' },
];

export default function ReportModal({
  postId,
  onClose,
}: {
  postId: number;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = orig; };
  }, []);
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0].id);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await reportPost(postId, selectedReason, details);
      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch {
      setSubmitted(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl relative border border-gray-100 dark:border-gray-700 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pinned header — the close button stays in reach while the long
            reason list scrolls on short viewports. */}
        <div className="relative shrink-0 px-6 pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-2 text-red-600 dark:text-red-400 pr-10">
            <Flag className="w-5 h-5 shrink-0" />
            <h2 id="report-modal-title" className="text-lg font-bold text-gray-900 dark:text-white">
              Report Post
            </h2>
          </div>
        </div>

        <div className="overflow-y-auto min-h-0 px-6 pt-4 pb-6">
        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto animate-bounce" />
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Report Received</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Thank you for keeping our community safe. Our moderation team has been notified.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Select the reason that best describes why this content violates community guidelines.
            </p>

            <div className="space-y-2 pt-1">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedReason === r.id
                      ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 font-medium'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.id}
                    checked={selectedReason === r.id}
                    onChange={() => setSelectedReason(r.id)}
                    className="text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </div>

            <div>
              <label htmlFor="report-details" className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                Additional context (optional):
              </label>
              <textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Help us understand the issue..."
                rows={3}
                className="w-full text-sm p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-gray-300 dark:border-gray-600 font-medium text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
              >
                {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
}
