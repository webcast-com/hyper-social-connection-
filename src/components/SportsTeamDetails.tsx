'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, PlayCircle } from 'lucide-react';
import EspnResponseDetails from './EspnResponseDetails';
import { formatPredictionKickoff } from '@/lib/sports';
import { competitionCountry } from '@/lib/sports-navigation';
import { safeSportsReturnPath } from '@/lib/sports-filters';
import { matchHref } from '@/lib/espn-match';
import { athleteHref } from '@/lib/espn-athlete';
import { teamHref, validEntityId, validTeamBoard, type TeamBoard, type TeamFixture, type TeamRosterEntry, type TeamSide } from '@/lib/espn-team';
import { browserTeamBoard } from '@/lib/espn-browser';
import { isStandingsBoard, type StandingsBoard } from '@/lib/espn-standings';
import type { SportsHighlightClip } from '@/lib/espn-highlights';
import type { SportsNewsArticle } from '@/lib/espn-news';

/**
 * One team's page: identity, standings, team news, fixture-matched highlights,
 * fixtures and squad, with explicit empty states for data ESPN does not publish.
 *
 * Its own component in the team detail stack — it does not render through the
 * match details card, the league table or the leaders board, and none of them
 * render it. The only thing they share is where a link points.
 *
 * Data arrives browser-first, exactly as the match details card does: this
 * reader's own browser asks ESPN for the three parts of the page, and whatever
 * it could not reach is asked of this site's own endpoint, which has the
 * server's cache, timeout and egress. `browserTeamBoard` reports which route
 * answered each part, the board is validated before it replaces what is on
 * screen, a failed refresh keeps the previous data, and nothing here
 * substitutes a sample squad: when ESPN does not report a part, that part says
 * so whichever route was used.
 */

/**
 * Which route answered a part. Both ask the same ESPN URL, so the label is the
 * only way a reader can tell; a board this page was rendered with came from the
 * server feed, which records no transport of its own.
 */
const transportLabel = (transport: 'browser' | 'server' | undefined) =>
  transport === 'browser' ? 'Asked by this browser' : 'Asked by this site’s server';

const sections = [['overview', 'Overview'], ['standings', 'Standings'], ['news', 'Team news'], ['injuries', 'Injuries'], ['transfers', 'Transfers'], ['highlights', 'Highlights'], ['fixtures', 'Fixtures & results'], ['squad', 'Squad']] as const;
type Section = typeof sections[number][0];

/** How many fixtures are listed per group; the board itself is bounded at 60. */
const LISTED = 20;

function EmptySection({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-white/15 p-5 text-sm text-gray-300">{children}</p>;
}

/** Provider crest, else the club's own initials. A crest is never synthesised. */
function Crest({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
  return <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-sm font-black text-gray-200">
    {url && !failed ? (
      // Provider CDN images load directly; fixed dimensions reserve the space.
      // eslint-disable-next-line @next/next/no-img-element -- provider crest, sized by the card
      <img src={url} alt="" width={56} height={56} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-14 w-14 rounded-full object-contain" />
    ) : <span>{initials || name.charAt(0)}</span>}
  </span>;
}

/** The portrait ladder used across the sports pages: photo, then initials. */
function Portrait({ url, name }: { url: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
  return url && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element -- provider photo, sized by the row
    <img src={url} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-8 w-8 shrink-0 rounded-full bg-white/[0.08] object-cover" />
  ) : (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-bold text-gray-300">
      {initials || name.charAt(0)}
    </span>
  );
}

function Facts({ facts }: { facts: [string, string | null][] }) {
  const shown = facts.filter(([, value]) => value !== null) as [string, string][];
  if (!shown.length) return <EmptySection>ESPN has not reported these details for this team.</EmptySection>;
  return <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
    {shown.map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.05] p-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold tabular-nums">{value}</dd>
    </div>)}
  </dl>;
}

/** A side of a fixture: linked to its own team page only when ESPN gave an id. */
function SideName({ side, league }: { side: TeamSide; league: string }) {
  const label = side.abbreviation && side.abbreviation !== side.name ? `${side.name} (${side.abbreviation})` : side.name;
  return side.id && validEntityId(side.id)
    ? <Link href={teamHref({ league, teamId: side.id })} prefetch={false} className="break-words font-semibold text-fuchsia-300 hover:underline">{label}</Link>
    : <span className="break-words font-semibold">{label}</span>;
}

function FixtureRow({ fixture, league, showScore }: { fixture: TeamFixture; league: string; showScore: boolean }) {
  const sides = [fixture.home, fixture.away].filter((side): side is TeamSide => !!side);
  return <li className="min-w-0 border-t border-white/[0.07] py-3 first:border-t-0">
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <span className="min-w-0 break-words text-sm">
        {sides.length === 2 ? <><SideName side={sides[0]} league={league} /> <span className="text-gray-400">v</span> <SideName side={sides[1]} league={league} /></>
          : fixture.opponent ? <>vs <SideName side={fixture.opponent} league={league} /></> : 'Opponent not reported'}
      </span>
      <Link href={matchHref({ league, eventId: fixture.id })} prefetch={false} className="inline-flex min-h-11 shrink-0 items-center text-xs font-semibold text-fuchsia-300 hover:underline">Match details</Link>
      {showScore && <span className="shrink-0 text-sm font-black tabular-nums">{sides.map((side) => side.score ?? '—').join(' – ')}</span>}
    </div>
    <p className="mt-1 break-words text-xs text-gray-400" suppressHydrationWarning>
      {formatPredictionKickoff(fixture.date)}
      {[fixture.statusText, fixture.competition, fixture.venue].filter(Boolean).map((part) => ` · ${part}`).join('')}
    </p>
  </li>;
}

function SquadRow({ person, league }: { person: TeamRosterEntry; league: string }) {
  const details = [
    person.age !== null ? `${person.age} yrs` : null,
    person.height ? `${person.height} height` : null,
    person.weight ? `${person.weight} weight` : null,
    person.experience,
    person.nationality,
    person.born ? `Born ${person.born}` : null,
  ].filter(Boolean);
  return <li className="flex min-w-0 items-center gap-3 border-t border-white/[0.07] py-2 first:border-t-0">
    <Portrait url={person.headshot} name={person.name} />
    <span className="w-7 shrink-0 text-sm text-gray-400 tabular-nums">{person.jersey ?? '—'}</span>
    <span className="min-w-0 flex-1">
      {person.id && validEntityId(person.id)
        ? <Link href={athleteHref({ league, athleteId: person.id })} prefetch={false} className="inline-flex min-h-11 min-w-0 items-center text-sm font-semibold break-words text-fuchsia-300 hover:underline">{person.name}</Link>
        : <span className="block break-words text-sm font-semibold">{person.name}</span>}
      <span className="block break-words text-xs text-gray-400">
        {[person.position, ...details].filter(Boolean).join(' · ') || 'Details not reported'}
      </span>
    </span>
  </li>;
}

export default function SportsTeamDetails({ initial, reference, returnTo }: { initial: TeamBoard; reference: { league: string; teamId: string }; returnTo?: string }) {
  const [board, setBoard] = useState(initial);
  const [section, setSection] = useState<Section>('overview');
  const [loading, setLoading] = useState(!initial.team);
  const [error, setError] = useState('');
  const [failure, setFailure] = useState<TeamBoard['sources'] | null>(null);
  const [standings, setStandings] = useState<StandingsBoard | null>(null);
  const [news, setNews] = useState<{ status: string; articles: SportsNewsArticle[] } | null>(null);
  const [clips, setClips] = useState<SportsHighlightClip[] | null>(null);
  const [sectionLoading, setSectionLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const sectionId = useId();

  const refresh = async (force = false) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller; setLoading(true); setError('');
    try {
      // ESPN in this browser first, this site's endpoint for whatever failed.
      const next = await browserTeamBoard(reference, controller.signal, force);
      if (!validTeamBoard(next, reference)) throw new Error('Invalid team response');
      if (controller.signal.aborted) return;
      if (next.status === 'unavailable' && board.team) {
        setFailure(next.sources);
        setError('Unable to update team details. Keeping the previous data. Please try again.');
      } else {
        setBoard(next);
        setFailure(null);
      }
    } catch {
      if (!controller.signal.aborted) setError('Could not load team details. Keeping the previous data. Please try again.');
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    // Deferred so effect cleanup can prevent an obsolete or Strict Mode request.
    void Promise.resolve().then(() => { if (active) void refresh(); });
    return () => { active = false; request.current?.abort(); request.current = null; };
    // Load on mount and when navigating to a different team.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference.league, reference.teamId]);

  const team = board.team;
  const sources = failure ?? board.sources;
  const missing = sources.filter((source) => !source.ok).map((source) => source.part);
  const results = board.fixtures.filter((fixture) => fixture.state === 'post')
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const upcoming = board.fixtures.filter((fixture) => fixture.state !== 'post')
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const nextFixture = upcoming[0] ?? null;
  const lastResult = results[0] ?? null;
  const partLabel = (part: string) => part === 'info' ? 'team identity' : part === 'schedule' ? 'fixtures' : 'the squad';

  const loadSection = async (id: Section) => {
    setSection(id);
    if (id === 'standings' && !standings) {
      setSectionLoading(true);
      try {
        const response = await fetch(`/api/sports/standings/${encodeURIComponent(reference.league)}`, { cache: 'no-store' });
        const data: unknown = await response.json();
        if (response.ok && isStandingsBoard(data, reference.league, null)) {
          setStandings(data);
        } else {
          setStandings({ league: reference.league, requestedSeason: null, season: null, status: 'unavailable', groups: [], fetchedAt: new Date().toISOString(), source: { ok: false, url: '', httpStatus: response.status } });
        }
      } catch {
        setStandings({ league: reference.league, requestedSeason: null, season: null, status: 'unavailable', groups: [], fetchedAt: new Date().toISOString(), source: { ok: false, url: '', httpStatus: null } });
      } finally {
        setSectionLoading(false);
      }
    }
    if (id === 'news' && !news) {
      setSectionLoading(true);
      try {
        const response = await fetch(`/api/sports/teams/${encodeURIComponent(reference.league)}/${encodeURIComponent(reference.teamId)}/news`, { cache: 'no-store' });
        const data = await response.json();
        setNews(response.ok && data && Array.isArray(data.articles) && typeof data.status === 'string'
          ? data
          : { status: 'unavailable', articles: [] });
      } catch {
        setNews({ status: 'unavailable', articles: [] });
      } finally {
        setSectionLoading(false);
      }
    }
    if (id === 'highlights' && !clips) {
      setSectionLoading(true);
      try {
        const response = await fetch(`/api/sports/highlights?index=1&kind=match&league=${encodeURIComponent(reference.league)}&days=365&limit=60`, { cache: 'no-store' });
        const data = await response.json();
        const rows = data?.index?.match;
        const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
        const exactTeamMatch = (clip: SportsHighlightClip) => !!team && [clip.home, clip.away].some((side) =>
          normalize(side) === normalize(team.name) || (!!team.abbreviation && normalize(side) === normalize(team.abbreviation)));
        setClips(response.ok && Array.isArray(rows) ? rows.filter(exactTeamMatch).slice(0, 12) : []);
      } catch {
        setClips([]);
      } finally {
        setSectionLoading(false);
      }
    }
  };

  return <div className="theme-player mx-auto max-w-5xl p-3 text-white sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <Link href={safeSportsReturnPath(returnTo)} prefetch={false} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-fuchsia-300"><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to sports scores</Link>
      <button type="button" onClick={() => void refresh(true)} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-white outline-none transition hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-fuchsia-300 disabled:opacity-60"><RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing…' : 'Refresh details'}</button>
    </div>

    {error && <p role="alert" className="mb-3 text-sm text-red-200">{error}</p>}

    <nav aria-label="Team navigation" className="mb-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-400">
      <span>{competitionCountry(reference.league) ?? 'Competition'}</span><span aria-hidden="true">/</span>
      <Link href={`/sports?league=${encodeURIComponent(reference.league)}`} prefetch={false} className="inline-flex min-h-11 items-center break-words font-semibold text-fuchsia-300 hover:underline">{board.leagueName}</Link>
      <span aria-hidden="true">/</span><span className="break-words">{team?.name ?? 'Team'}</span>
    </nav>

    <header className="theme-player-hero mb-5 min-w-0 rounded-3xl p-4 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-fuchsia-300">ESPN · {board.leagueName}</p>
      <div className="mt-3 flex min-w-0 items-start gap-4">
        <Crest url={team?.logo ?? null} name={team?.name ?? 'Team'} />
        <div className="min-w-0">
          <h1 className="break-words text-xl font-black sm:text-3xl">{team?.name ?? (loading ? 'Loading team details…' : 'Team details unavailable')}</h1>
          {team && <p className="mt-2 break-words text-sm text-gray-300">
            {[team.standing, team.record ? `Record ${team.record}` : null, team.abbreviation, team.active === false ? 'Reported inactive' : null].filter(Boolean).join(' · ') || 'No record reported yet'}
          </p>}
          {team?.venue && <p className="mt-1 break-words text-sm text-gray-400">{team.venue}</p>}
        </div>
      </div>
      {team && (team.colours.primary || team.colours.secondary) && (
        <div className="mt-4 flex items-center gap-2">
          {[team.colours.primary, team.colours.secondary].filter(Boolean).map((value) => (
            <span key={value} aria-label={`Reported club colour ${value}`} className="h-3 w-10 rounded-full ring-1 ring-black/10" style={{ backgroundColor: value as string }} />
          ))}
          <span className="text-xs text-gray-400">Reported club colours</span>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-400">Only ESPN-reported data is shown. — means not reported. Coverage varies by sport and competition.</p>
      <p className="mt-1 text-xs text-gray-400" suppressHydrationWarning>Last checked: {formatPredictionKickoff(board.fetchedAt)}</p>
    </header>

    {!team ? <p role="status" className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm text-amber-100">
      {loading ? 'Loading ESPN team details…'
        : sources.some((source) => source.httpStatus === 403) ? 'Access to ESPN team details was refused (HTTP 403).'
        : 'ESPN team details are currently unavailable.'}
      {' '}No sample squad, record or fixtures are substituted.
    </p> : <>
      <div role="group" aria-label="Team detail sections" className="sticky top-16 z-20 mb-4 flex min-w-0 flex-wrap gap-2 rounded-2xl bg-[#0f0b1c]/90 py-2">
        {sections.map(([id, label]) => <button key={id} type="button" aria-pressed={section === id} aria-controls={sectionId} onClick={() => void loadSection(id)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-fuchsia-300 ${section === id ? 'border-fuchsia-200 bg-fuchsia-200 text-gray-950' : 'border-white/10 bg-white/[0.04] text-gray-200 hover:bg-white/[0.08]'}`}>{label}</button>)}
      </div>

      <section id={sectionId} aria-label={sections.find(([id]) => id === section)?.[1]} aria-busy={loading || sectionLoading} className="min-w-0 rounded-3xl border border-white/[0.07] bg-white/[0.03] p-3 sm:p-5">
        <h2 className="mb-4 text-lg font-bold">{sections.find(([id]) => id === section)?.[1]}</h2>
        {missing.length > 0 && <p className="mb-3 rounded-xl bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200">ESPN did not answer for {missing.map(partLabel).join(' or ')}. What is shown below is what was reported.</p>}

        {sectionLoading && <p role="status" className="mb-3 rounded-xl border border-white/10 p-4 text-sm text-gray-300">Loading ESPN {section === 'news' ? 'team news' : section}…</p>}

        {section === 'standings' && !sectionLoading && (standings?.status === 'ready' ? <div className="space-y-5">
          <p className="text-xs text-gray-400">ESPN standings · {standings.season?.label ?? standings.season?.year ?? 'current season'} · team row highlighted when present.</p>
          {standings.groups.map((group) => <div key={group.id} className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.08]">
            <h3 className="bg-white/[0.05] px-3 py-2 text-sm font-bold">{group.label}</h3>
            <div className="overflow-x-auto"><table className="w-full min-w-max text-left text-xs"><thead className="text-gray-400"><tr><th className="px-3 py-2">Team</th>{group.columns.map((column) => <th key={column.name} title={column.description} className="px-3 py-2">{column.label}</th>)}</tr></thead><tbody>{group.rows.map((row) => <tr key={row.teamId} className={`border-t border-white/[0.06] ${row.teamId === reference.teamId ? 'bg-fuchsia-300/10 font-bold text-fuchsia-100' : ''}`}><th scope="row" className="px-3 py-2"><Link href={`/sports/teams/${encodeURIComponent(reference.league)}/${encodeURIComponent(row.teamId)}`} prefetch={false} className="inline-flex min-h-10 items-center gap-2 hover:underline">{row.rank && <span className="text-gray-400">{row.rank}</span>}{row.team}</Link>{row.note && <span className="ml-2 text-gray-400">{row.note}</span>}</th>{group.columns.map((column) => <td key={column.name} className="px-3 py-2 tabular-nums">{row.values[column.name] ?? '—'}</td>)}</tr>)}</tbody></table></div>
          </div>)}
        </div> : <EmptySection>{standings?.status === 'empty' ? 'ESPN answered, but no standings table is published for this competition right now.' : standings ? 'ESPN standings are currently unavailable for this competition.' : 'Open Standings to load the league table.'}</EmptySection>)}

        {section === 'news' && !sectionLoading && (news?.status === 'ready' ? <ul className="grid min-w-0 gap-3 md:grid-cols-2">{news.articles.map((article) => <li key={article.id} className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4"><a href={article.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center text-sm font-bold text-fuchsia-200 hover:underline">{article.headline}</a>{article.description && <p className="mt-1 line-clamp-3 text-sm text-gray-300">{article.description}</p>}<p className="mt-2 text-xs text-gray-500">ESPN · {article.leagueName}{article.published ? ` · ${formatPredictionKickoff(article.published)}` : ''}</p></li>)}</ul> : <EmptySection>{news?.status === 'empty' ? 'ESPN’s current competition news feed has no articles explicitly mentioning this team.' : news ? 'Team news is unavailable right now. No unverified headlines are substituted.' : 'Open Team news to load recent ESPN articles mentioning this team.'}</EmptySection>)}

        {section === 'injuries' && <EmptySection>ESPN does not provide a verified team-wide injury list for this team page. Match-summary injury reports are fixture-specific, so they are not presented here as a current team injury roster.</EmptySection>}

        {section === 'transfers' && <EmptySection>No verified team-specific transfer feed is available for this competition. Transfer rumours or league-wide articles are not presented as confirmed team transfers.</EmptySection>}

        {section === 'highlights' && !sectionLoading && (clips?.length ? <ul className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">{clips.map((clip) => <li key={clip.id} className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">{clip.thumbnail && (clip.page ? <a href={clip.page} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Watch ${clip.title}`} className="block"><img src={clip.thumbnail} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover" /></a> : <div><img src={clip.thumbnail} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover" /></div>)}<div className="p-3"><p className="line-clamp-2 text-sm font-bold">{clip.title}</p><p className="mt-1 text-xs text-gray-400">{clip.home} vs {clip.away} · ESPN</p>{clip.page && <a href={clip.page} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-fuchsia-200 hover:underline"><PlayCircle aria-hidden="true" className="h-4 w-4" />Watch highlight</a>}</div></li>)}</ul> : <EmptySection>{clips ? 'No team-matched clips are available in the ESPN highlight index yet. Match videos are shown only when the indexed home or away team exactly matches.' : 'Open Highlights to check ESPN’s indexed match clips for this team.'}</EmptySection>)}

        {section === 'overview' && <>
          <Facts facts={[
            ['Competition', board.leagueName],
            ['Record', team.record],
            ['Standing', team.standing],
            ['Code', team.abbreviation],
            ['Venue', team.venue],
            ['Status', team.active === null ? null : team.active ? 'Active' : 'Inactive'],
          ]} />
          {(nextFixture || lastResult) && <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
            {nextFixture && <article className="min-w-0 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-fuchsia-300">Next reported fixture</h3>
              <ul className="mt-2"><FixtureRow fixture={nextFixture} league={reference.league} showScore={false} /></ul>
            </article>}
            {lastResult && <article className="min-w-0 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-fuchsia-300">Last reported result</h3>
              <ul className="mt-2"><FixtureRow fixture={lastResult} league={reference.league} showScore /></ul>
            </article>}
          </div>}
          {team.links.length > 0 && <div className="mt-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">On ESPN</h3>
            <ul className="flex min-w-0 flex-wrap gap-2">{team.links.map((link) => <li key={link.url}>
              <a href={link.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-fuchsia-200 hover:bg-white/[0.08]">{link.label}</a>
            </li>)}</ul>
          </div>}
        </>}

        {section === 'fixtures' && (board.fixtures.length ? <>
          {upcoming.length > 0 && <div className="mb-5 min-w-0">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fuchsia-300">Upcoming</h3>
            <ul className="min-w-0">{upcoming.slice(0, LISTED).map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} league={reference.league} showScore={false} />)}</ul>
            {upcoming.length > LISTED && <p className="mt-2 text-xs text-gray-400">{upcoming.length - LISTED} further reported fixtures are not listed.</p>}
          </div>}
          {results.length > 0 && <div className="min-w-0">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-fuchsia-300">Results</h3>
            <ul className="min-w-0">{results.slice(0, LISTED).map((fixture) => <FixtureRow key={fixture.id} fixture={fixture} league={reference.league} showScore />)}</ul>
            {results.length > LISTED && <p className="mt-2 text-xs text-gray-400">{results.length - LISTED} further reported results are not listed.</p>}
          </div>}
          {!upcoming.length && !results.length && <EmptySection>ESPN reported fixtures for this team without a state, so none can be listed as upcoming or finished.</EmptySection>}
          <p className="mt-4 text-xs text-gray-400">Fixtures are grouped by the state ESPN reports, not by comparing dates with the clock, so a postponed match is never relabelled as a result.</p>
        </> : <EmptySection>ESPN has not reported fixtures for this team. Schedules are published for some competitions and not others.</EmptySection>)}

        {section === 'squad' && (board.roster.length ? <>
          <p className="mb-3 text-xs text-gray-400">Reported squad: {board.roster.length} {board.roster.length === 1 ? 'player' : 'players'}. Portraits are the photos ESPN reported{board.portraitsFromCdn ? ', or this player’s ESPN headshot for the NBA and NFL' : ', and are not synthesised for this competition'}; initials are shown when none was reported.</p>
          <ul className="min-w-0">{board.roster.map((person, index) => <SquadRow key={person.id ?? `${person.name}-${index}`} person={person} league={reference.league} />)}</ul>
        </> : <EmptySection>ESPN has not reported a squad for this team. Rosters are published for some competitions and not others.</EmptySection>)}
      </section>
    </>}

    <details className="mt-5 min-w-0 rounded-xl border border-white/[0.07] p-3 text-xs text-gray-300">
      <summary className="min-h-11 cursor-pointer font-semibold">ESPN team feed details</summary>
      <ul className="mt-2 space-y-2">{sources.map((source) => <li key={`${source.part}-${source.url}`} className="min-w-0">
        <p className="break-words font-semibold capitalize">{partLabel(source.part)}: {source.ok ? 'reported' : 'not reported'}</p>
        <p className="break-words">{source.httpStatus === null ? 'No HTTP response' : `HTTP ${source.httpStatus}`}{source.errorKind ? ` · ${source.errorKind}` : ''}{source.error ? ` · ${source.error}` : ''}</p>
        <p className="break-words">{transportLabel(source.transport)}</p>
        <EspnResponseDetails metadata={source.responseMetadata} />
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-fuchsia-300 underline">{source.url}</a>
      </li>)}</ul>
    </details>
  </div>;
}
