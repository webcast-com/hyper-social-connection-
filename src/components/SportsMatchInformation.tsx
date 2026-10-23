import type { MatchDetails } from '@/lib/espn-match';
import { formatPredictionKickoff } from '@/lib/sports';
export function SportsMatchInformation({ match }: { match: MatchDetails }) {
  const info = match.information;
  return <dl className="grid min-w-0 gap-4 text-sm sm:grid-cols-2">
    {[['Competition', match.leagueName], ['Season', match.season?.label ?? match.season?.year], ['Kickoff (EAT)', match.kickoff ? formatPredictionKickoff(match.kickoff) : null], ['Venue', match.venue], ['Round / stage', info?.stage], ['Attendance', info?.attendance]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{label}</dt><dd className="mt-1 break-words">{value ?? '—'}</dd></div>)}
    <div className="min-w-0 sm:col-span-2"><dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Match officials</dt><dd className="mt-1">{info?.officials.length ? <ul className="space-y-1">{info.officials.map((official, index) => <li key={index} className="break-words">{official.name}{official.role ? ` · ${official.role}` : ''}</li>)}</ul> : '—'}</dd></div>
  </dl>;
}
