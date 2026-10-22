import type { SportsRace } from '@/lib/sports';

export default function SportsRaceSummary({ race }: { race: SportsRace }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="break-words text-sm font-bold text-gray-900 dark:text-white">{race.title}</p>
      {race.entries.length ? (
        <ol aria-label="Reported race positions" className="space-y-1 text-xs text-gray-700 dark:text-gray-200">
          {race.entries.slice(0, 3).map((entry, index) => (
            <li key={`${entry.name}-${index}`} className="flex min-w-0 items-start gap-2">
              <span className="w-6 shrink-0 tabular-nums font-bold">{entry.position ? `#${entry.position}` : '–'}</span>
              <span className="min-w-0 break-words">{entry.name}</span>
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-gray-500 dark:text-gray-400">Line-up not yet reported.</p>}
    </div>
  );
}
