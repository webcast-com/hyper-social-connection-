import { competitionCountry } from '@/lib/sports-navigation';
import type { SPORTS_COMPETITIONS } from '@/lib/sports-catalog';

export default function SportsCompetitionBrowser({ competitions, counts, selected, onSelect }: {
  competitions: typeof SPORTS_COMPETITIONS; counts: Map<string, number>; selected: string; onSelect: (league: string) => void;
}) {
  const countries = [...new Set(competitions.map((item) => competitionCountry(item.slug) ?? 'Other'))].sort();
  return <nav aria-label="Competition browser" className="min-w-0 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Countries & competitions</p>
    <button type="button" aria-pressed={selected === 'all'} onClick={() => onSelect('all')} className="mb-2 min-h-11 w-full rounded-xl bg-blue-50 px-3 text-left text-sm font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">All competitions</button>
    <div className="max-h-[65vh] space-y-1 overflow-y-auto">
      {countries.map((country) => <details key={country} open={competitions.some((item) => item.slug === selected && competitionCountry(item.slug) === country)}>
        <summary className="min-h-11 cursor-pointer content-center break-words rounded-lg px-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700">{country}</summary>
        <ul className="border-l border-gray-200 pl-2 dark:border-gray-700">{competitions.filter((item) => (competitionCountry(item.slug) ?? 'Other') === country).map((item) => <li key={item.slug}>
          <button type="button" aria-label={`Show ${item.name}`} aria-pressed={selected === item.slug} onClick={() => onSelect(item.slug)} className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-xs ${selected === item.slug ? 'bg-blue-600 font-bold text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}>
            <span className="min-w-0 break-words">{item.name}</span><span className="shrink-0 tabular-nums" aria-label={`${counts.get(item.slug) ?? 0} loaded fixtures`}>{counts.get(item.slug) ?? 0}</span>
          </button>
        </li>)}</ul>
      </details>)}
    </div>
    <p className="mt-3 text-[11px] text-gray-500 dark:text-gray-400">Counts show loaded fixtures, not a promise of matches today.</p>
  </nav>;
}
