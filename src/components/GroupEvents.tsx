'use client';

import { useState, useTransition } from 'react';
import { CalendarDays, MapPin, Plus } from 'lucide-react';
import { createGroupEvent, rsvpGroupEvent } from '@/app/social-actions';

type EventRow = {
  id: number;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string | Date;
  going: number;
  maybe: number;
  myStatus?: string | null;
};

export default function GroupEvents({
  groupId,
  events,
  canCreate,
}: {
  groupId: number;
  events: EventRow[];
  canCreate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-blue-500" /> Events
        </h2>
        {canCreate && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-blue-600 inline-flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        )}
      </div>

      {open && canCreate && (
        <form
          className="space-y-2 mb-4"
          action={(fd) => {
            setError('');
            startTransition(async () => {
              const result = await createGroupEvent(groupId, fd);
              if (!result.success) setError(result.message || 'Could not create event');
              else setOpen(false);
            });
          }}
        >
          <input name="title" required placeholder="Event title" className="w-full text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2" />
          <input name="startsAt" type="datetime-local" required className="w-full text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2" />
          <input name="location" placeholder="Location (optional)" className="w-full text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2" />
          <textarea name="description" rows={2} placeholder="Details" className="w-full text-sm rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={pending} className="w-full text-xs font-bold bg-blue-600 text-white rounded-xl py-2 disabled:opacity-50">
            {pending ? 'Saving…' : 'Publish event'}
          </button>
        </form>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming events.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => {
            const when = new Date(ev.startsAt);
            return (
              <li key={ev.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
                <div className="font-semibold text-sm text-gray-900 dark:text-white">{ev.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{when.toLocaleString()}</div>
                {ev.location && (
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" /> {ev.location}
                  </div>
                )}
                {ev.description && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{ev.description}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => startTransition(async () => { await rsvpGroupEvent(ev.id, ev.myStatus === 'going' ? 'none' : 'going'); })}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg ${ev.myStatus === 'going' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
                  >
                    Going · {ev.going}
                  </button>
                  <button
                    type="button"
                    onClick={() => startTransition(async () => { await rsvpGroupEvent(ev.id, ev.myStatus === 'maybe' ? 'none' : 'maybe'); })}
                    className={`text-[11px] font-bold px-2 py-1 rounded-lg ${ev.myStatus === 'maybe' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
                  >
                    Maybe · {ev.maybe}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
