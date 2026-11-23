'use client';

/**
 * The live-stream screen: SportSRC's streamed fixtures as a three-column
 * dashboard — navigation and leagues on the left, the player and the match list
 * in the middle, news and highlights on the right.
 *
 * What it will not do, because SportSRC does not supply it:
 *
 *   - show a viewer count. There is none in the API, so the chip in that place
 *     names the competition instead;
 *   - draw volume or seek controls. The stream is a third party's player in an
 *     iframe; this page cannot reach inside it, and a control that does nothing
 *     is worse than none. Play, stop, the source switcher and full screen are
 *     real;
 *   - load a stream before the reader asks for one. The player is a frame from
 *     another site that carries that site's advertising, so it is requested when
 *     play is pressed and removed when stop is.
 *
 * The frame has no `sandbox` attribute and keeps the default referrer policy on
 * purpose: SportSRC's player refuses a sandboxed frame and one that sends no
 * referrer (https://sportsrc.org/guides/embed-live-stream/).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { profileHref } from '@/lib/social-href';
import {
  Bell, Bookmark, BookmarkCheck, CalendarDays, CalendarPlus, ChevronDown, ChevronUp, Clapperboard, Info, LayoutGrid,
  LoaderCircle, Maximize, Newspaper, Play, Radio, RefreshCw, Search, Settings, Square, Star, Trophy, Volleyball, X,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import SponsorBanners from '@/components/SponsorBanners';
import StreamHighlightClips, { playableClipFile, type StreamHighlightItem } from '@/components/StreamHighlightClips';
import {
  STREAM_TABS, featuredStreamMatch, filterStreamMatches, isWatchable, localDayKey, orderStreamMatches, streamClock,
  streamDateLabel, streamMatchIcs, streamScore,
  type StreamBoard, type StreamDetailResult, type StreamMatch, type StreamState, type StreamTab, type StreamTeam,
} from '@/lib/sportsrc';
import {
  toggleFavouriteClub, toggleSavedMatch, toggleSavedNews, useStreamSaved, type SavedNews,
} from '@/lib/stream-saved';

export type StreamNewsItem = SavedNews & { sport: string };
export type { StreamHighlightItem } from '@/components/StreamHighlightClips';
export type StreamViewer = { id: number | string; name: string | null; avatar: string | null } | null;

/** How often the list is re-read while the page is on screen. */
const POLL_MS = 60_000;
/** Rail lists show this many until "See All" is pressed, as the design does. */
const RAIL_ROWS = 4;
/** Leagues listed before "More leagues". */
const LEAGUE_ROWS = 8;

const noop = () => () => {};
/** False on the server and during hydration, true afterwards — when the reader's time zone is known. */
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

const STATE_MESSAGE: Record<Exclude<StreamState, 'ok'>, { title: string; detail: string }> = {
  'missing-key': { title: 'Live streams are not switched on yet', detail: 'The stream provider has not been connected to this site.' },
  unauthorized: { title: 'Live streams are not available', detail: 'The stream provider refused this site’s access.' },
  'rate-limited': { title: 'Today’s stream allowance is used up', detail: 'The list comes back after midnight UTC.' },
  unavailable: { title: 'The stream provider is not answering', detail: 'This page keeps trying; nothing needs reloading.' },
};

/** A kickoff in the reader's zone: the time today, the weekday and time otherwise. */
function kickoffShort(iso: string | null, long = false): string {
  if (!iso) return 'TBD';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'TBD';
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
  if (localDayKey(date) === localDayKey()) return long ? `Today · ${time}` : time;
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
  return long ? `${day} · ${time}` : `${day} ${time}`;
}

function newsDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(date).toUpperCase();
}

function SportGlyph({ sport, className }: { sport: string; className?: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, 'aria-hidden': true };
  switch (sport) {
    case 'football':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="m12 7.6 4 2.9-1.5 4.7h-5L8 10.5l4-2.9Z" />
          <path d="M12 3v4.6M20.6 9.5 16 10.5M17.3 19.2l-2.8-4M6.7 19.2l2.8-4M3.4 9.5 8 10.5" />
        </svg>
      );
    case 'basketball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18M5.6 5.6c2.6 3.4 2.6 9.4 0 12.8M18.4 5.6c-2.6 3.4-2.6 9.4 0 12.8" />
        </svg>
      );
    case 'baseball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M6.2 5.2c2 2 3 4.3 3 6.8s-1 4.8-3 6.8M17.8 5.2c-2 2-3 4.3-3 6.8s1 4.8 3 6.8" />
        </svg>
      );
    case 'tennis':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3.2 10c4 .4 7.2-2.6 7-6.8M20.8 14c-4-.4-7.2 2.6-7 6.8" />
        </svg>
      );
    case 'volleyball':
      return <Volleyball className={className} aria-hidden="true" />;
    default:
      return <Trophy className={className} aria-hidden="true" />;
  }
}

/** A side's badge, or its code on a disc when there is no badge or it does not load. */
function Crest({ team, size = 'md' }: { team: StreamTeam; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState<string | null>(null);
  const check = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setFailed(team.badge);
  }, [team.badge]);
  if (!team.badge || team.badge === failed) {
    return <span aria-hidden="true" className={`sx-crest sx-crest--code sx-crest--${size}`}>{team.code.slice(0, 3)}</span>;
  }
  return (
    <span aria-hidden="true" className={`sx-crest sx-crest--${size}`}>
      <img ref={check} src={team.badge} alt="" loading="lazy" decoding="async" onError={() => setFailed(team.badge)} />
    </span>
  );
}

function Thumb({ src, className }: { src: string | null; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span aria-hidden="true" className={`${className} sx-thumb--empty`} />;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />;
}

type DetailEntry = { state: StreamState | 'loading'; result: StreamDetailResult | null };

export default function SportsStreamDashboard({
  initial, news, highlights, viewer, initialMatchId = null,
}: {
  /** The match to open on (`?match=`), when a link named one. */
  initialMatchId?: string | null;
  initial: StreamBoard;
  news: StreamNewsItem[];
  highlights: StreamHighlightItem[];
  viewer: StreamViewer;
}) {
  const hydrated = useHydrated();
  const saved = useStreamSaved();
  const [board, setBoard] = useState(initial);
  const [sport, setSport] = useState(initial.sport);
  /** '' is SportSRC's own current list; a day is sent only once the reader picks one. */
  const [date, setDate] = useState(initial.date);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<StreamTab>(() => {
    // A link to one match opens the tab that match is listed under.
    const asked = initialMatchId ? initial.matches.find((match) => match.id === initialMatchId) : null;
    if (asked && asked.status !== 'live') return 'all';
    return initial.matches.some((match) => match.status === 'live') ? 'live' : 'all';
  });
  const [nav, setNav] = useState<'dashboard' | 'live'>('dashboard');
  const [league, setLeague] = useState<string | null>(null);
  const [club, setClub] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [leaguesOpen, setLeaguesOpen] = useState(true);
  const [allLeagues, setAllLeagues] = useState(false);
  const [clubsOpen, setClubsOpen] = useState(false);
  const [allNews, setAllNews] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialMatchId);
  const [pinned, setPinned] = useState<StreamMatch | null>(null);
  const [playing, setPlaying] = useState(false);
  /** The highlight in the large player. A match and a clip are never there together. */
  const [clip, setClip] = useState<StreamHighlightItem | null>(null);
  const [clipFailed, setClipFailed] = useState(false);
  const [unplayableClips, setUnplayableClips] = useState<ReadonlySet<string>>(new Set());
  const clipRef = useRef<HTMLVideoElement | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [infoId, setInfoId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DetailEntry>>({});
  const playerRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const newsRef = useRef<HTMLElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);

  const today = hydrated ? localDayKey() : '';
  const mounted = useRef(false);
  const initialState = initial.state;

  // The list: read again when the sport or the day changes, and once a minute
  // while the page is on screen. A hidden tab asks for nothing.
  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    const read = async (showBusy: boolean) => {
      if (document.visibilityState === 'hidden') return;
      if (showBusy) setLoading(true);
      try {
        const params = new URLSearchParams({ sport });
        if (date) params.set('date', date);
        const response = await fetch(`/api/sports/streams?${params}`, { signal: controller.signal });
        const next = (await response.json()) as StreamBoard;
        if (!stopped && next && Array.isArray(next.matches)) setBoard(next);
      } catch {
        // Keep what is on screen; the next tick tries again.
      } finally {
        if (!stopped) setLoading(false);
      }
    };
    // The server already rendered the first list, so the first read can wait a
    // tick — unless the provider had not answered inside the render's budget.
    // Every later run is a change of sport or day, and reads at once.
    const first = !mounted.current;
    mounted.current = true;
    if (!first || initialState === 'unavailable') void read(true);
    const timer = window.setInterval(() => void read(false), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void read(false); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sport, date, initialState]);

  const matches = useMemo(() => orderStreamMatches(board.matches), [board.matches]);
  const bookmarkIds = useMemo(() => new Set(saved.matches.map((match) => match.id)), [saved.matches]);
  const byId = useMemo(() => new Map(matches.map((match) => [match.id, match])), [matches]);

  // Bookmarks outlive the day's list, so that tab is drawn from the saved copies,
  // each replaced by today's version of the same match when the list has one.
  const rows = useMemo(() => {
    const pool = tab === 'bookmarks' ? saved.matches.map((match) => byId.get(match.id) ?? match) : matches;
    return filterStreamMatches(pool, { tab, league: tab === 'bookmarks' ? null : league, club, query, bookmarks: bookmarkIds });
  }, [tab, saved.matches, byId, matches, league, club, query, bookmarkIds]);

  const featured = useMemo(() => featuredStreamMatch(matches), [matches]);
  const selected = (selectedId ? byId.get(selectedId) ?? (pinned?.id === selectedId ? pinned : null) : null) ?? featured;
  const watchable = selected ? isWatchable(selected) : false;
  const detail = selected ? details[selected.id] : undefined;
  const sources = detail?.result?.detail?.sources ?? [];
  const source = sources[Math.min(sourceIndex, Math.max(0, sources.length - 1))] ?? null;

  // The entries are mirrored in a ref so that "is this already being asked?" is
  // answered at once: a state updater may run later, and a second request for the
  // same match would be spent against the day's allowance.
  const detailsRef = useRef<Record<string, DetailEntry>>({});
  const putDetail = useCallback((id: string, entry: DetailEntry) => {
    detailsRef.current = { ...detailsRef.current, [id]: entry };
    setDetails(detailsRef.current);
  }, []);
  const loadDetail = useCallback(async (id: string, force = false) => {
    const held = detailsRef.current[id];
    if (held && (held.state === 'loading' || (held.state === 'ok' && !force))) return;
    putDetail(id, { state: 'loading', result: held?.result ?? null });
    let result: StreamDetailResult = { state: 'unavailable', detail: null };
    try {
      const response = await fetch(`/api/sports/streams/detail?id=${encodeURIComponent(id)}`);
      const body = (await response.json()) as StreamDetailResult;
      if (body && typeof body.state === 'string') result = body;
    } catch {
      // Reported as unavailable; the reader can try again.
    }
    putDetail(id, { state: result.state, result });
  }, [putDetail]);

  const stop = useCallback(() => { setPlaying(false); setSourceIndex(0); }, []);

  const closeClip = () => { setClip(null); setClipFailed(false); };

  /**
   * A highlight from the rail, played in the large player. The player is put on
   * the page inside the reader's own press (`flushSync`) and started from it,
   * which is what lets a browser play it with sound.
   */
  const playClip = (item: StreamHighlightItem) => {
    if (!playableClipFile(item.mp4)) return;
    flushSync(() => { stop(); setClipFailed(false); setClip(item); });
    const video = clipRef.current;
    if (video) {
      try {
        const started = video.play() as Promise<void> | undefined;
        // A refused start is not an error: the player's own controls are there to press.
        started?.catch?.(() => undefined);
      } catch { /* The `error` event reports a file that will not play. */ }
    }
    // The rail is below the player on a phone and a tablet.
    if (window.matchMedia('(max-width: 1023px)').matches) playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const clipError = () => {
    if (!clip) return;
    setClipFailed(true);
    setUnplayableClips((current) => new Set(current).add(clip.id));
  };

  const select = (match: StreamMatch) => {
    closeClip();
    if (match.id !== selected?.id) stop();
    setSelectedId(match.id);
    setPinned(match);
    // On a phone the player is above the list and may be off screen.
    if (window.matchMedia('(max-width: 1023px)').matches) playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const play = () => {
    if (!selected || !watchable) return;
    closeClip();
    // Pin the match, so a list refresh that reorders it cannot swap the stream.
    setSelectedId(selected.id);
    setPinned(selected);
    setSourceIndex(0);
    setPlaying(true);
    void loadDetail(selected.id);
  };

  const fullscreen = () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stage.requestFullscreen?.().catch(() => {});
  };

  const openInfo = (match: StreamMatch) => {
    if (infoId === match.id) { setInfoId(null); return; }
    setInfoId(match.id);
    void loadDetail(match.id);
  };

  const addToCalendar = (match: StreamMatch) => {
    const ics = streamMatchIcs(match, `${window.location.origin}/sports/live`);
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${match.home.code}-${match.away.code}.ics`.toLowerCase();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const changeSport = (id: string) => {
    if (id === sport) return;
    stop();
    closeClip();
    setSelectedId(null); setPinned(null); setLeague(null); setClub(null); setInfoId(null);
    setSport(id);
  };

  const changeDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const next = value === localDayKey() ? '' : value;
    if (next === date) return;
    if (!playing) { setSelectedId(null); setPinned(null); }
    setInfoId(null);
    setDate(next);
    if (next) setTab('all');
  };

  const openDatePicker = () => {
    const input = dateRef.current;
    if (!input) return;
    try { input.showPicker(); } catch { input.focus(); input.click(); }
  };

  const goDashboard = () => {
    setNav('dashboard'); setLeague(null); setClub(null); setQuery('');
    setTab(matches.some((match) => match.status === 'live') ? 'live' : 'all');
  };
  const goLive = () => { setNav('live'); setTab('live'); listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const goBookmarks = () => { setTab('bookmarks'); listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const goNews = () => { setAllNews(true); newsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); newsRef.current?.focus({ preventScroll: true }); };
  const active = tab === 'bookmarks' ? 'bookmarks' : nav;

  const sportNews = useMemo(() => {
    const own = news.filter((item) => item.sport === sport);
    return own.length ? own : news;
  }, [news, sport]);
  const savedNewsIds = useMemo(() => new Set(saved.news.map((item) => item.id)), [saved.news]);
  const leagues = allLeagues ? board.leagues : board.leagues.slice(0, LEAGUE_ROWS);
  const clubBadge = (name: string) => {
    for (const match of matches) {
      if (match.home.name.toLowerCase() === name.toLowerCase()) return match.home;
      if (match.away.name.toLowerCase() === name.toLowerCase()) return match.away;
    }
    return { name, code: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase(), badge: null, color: null } satisfies StreamTeam;
  };

  const trouble = board.state === 'ok' ? null : STATE_MESSAGE[board.state];
  const selectedClock = selected ? streamClock(selected) ?? (hydrated ? kickoffShort(selected.startAt) : 'Upcoming') : '';
  const dateLabel = hydrated ? streamDateLabel(date || today, today) : 'Today';
  const emptyLabel = tab === 'bookmarks'
    ? 'No bookmarked matches yet. Use the bookmark on a match to keep it here.'
    : query || league || club
      ? 'No match fits this filter.'
      : tab === 'live' ? 'No match with a stream is in play right now.'
        : tab === 'upcoming' ? 'No upcoming match has a stream listed yet. Streams are listed close to kick-off.'
          : tab === 'finished' ? 'No finished matches in this list.'
            : 'No matches with a stream are listed for this day.';

  return (
    <div className="sx-shell" data-stream-shell>
      <header className="sx-top">
        <div className="sx-top__brand">
          <BrandLogo ariaLabel="Hyper home" />
          <span className="sx-top__tag">Live</span>
        </div>

        <nav aria-label="Sports" className="sx-sports">
          {board.sports.map((item) => (
            <button key={item.id} type="button" onClick={() => changeSport(item.id)} aria-pressed={item.id === sport}
              className={`sx-sports__tab${item.id === sport ? ' is-active' : ''}`}>
              <SportGlyph sport={item.id} className="sx-sports__icon" />
              <span>{item.name}</span>
            </button>
          ))}
        </nav>

        <div className="sx-top__tools">
          <label className="sx-search">
            <Search aria-hidden="true" className="sx-search__icon" />
            <span className="sr-only">Search matches</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search games, teams, leagues…" />
          </label>
          <Link href={viewer ? '/notifications' : '/login'} aria-label="Notifications" title="Notifications" className="sx-icon-btn sx-top__account">
            <Bell aria-hidden="true" />
          </Link>
          {viewer ? (
            <Link href={profileHref(viewer)} aria-label="Your profile" title="Your profile" className="sx-avatar sx-top__account">
              {viewer.avatar ? <img src={viewer.avatar} alt="" /> : <span aria-hidden="true">{viewer.name?.charAt(0)?.toUpperCase() || 'U'}</span>}
            </Link>
          ) : (
            <Link href="/login" className="sx-signin sx-top__account">Sign in</Link>
          )}
        </div>
      </header>

      <div className="sx-body">
        <aside className="sx-side" aria-label="Streams navigation">
          <nav className="sx-nav" aria-label="Sections">
            <button type="button" onClick={goDashboard} aria-current={active === 'dashboard' ? 'page' : undefined} className={`sx-nav__item${active === 'dashboard' ? ' is-active' : ''}`}>
              <LayoutGrid aria-hidden="true" /><span>Dashboard</span>
            </button>
            <button type="button" onClick={goLive} className={`sx-nav__item${active === 'live' ? ' is-active' : ''}`}>
              <Radio aria-hidden="true" /><span>Live now</span>
            </button>
            <Link href="/sports/highlights" className="sx-nav__item"><Clapperboard aria-hidden="true" /><span>Highlights</span></Link>
            <button type="button" onClick={goBookmarks} className={`sx-nav__item${active === 'bookmarks' ? ' is-active' : ''}`}>
              <Bookmark aria-hidden="true" /><span>Bookmarks</span>
            </button>
            <button type="button" onClick={goNews} className="sx-nav__item"><Newspaper aria-hidden="true" /><span>News</span></button>
            <Link href="/settings" className="sx-nav__item"><Settings aria-hidden="true" /><span>Settings</span></Link>
          </nav>

          <section className="sx-group">
            <button type="button" className="sx-group__head" aria-expanded={leaguesOpen} onClick={() => setLeaguesOpen((open) => !open)}>
              <span>{board.sports.find((item) => item.id === sport)?.name ?? 'Football'} Leagues</span>
              {leaguesOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </button>
            {leaguesOpen && (
              board.leagues.length === 0 ? (
                <p className="sx-group__empty">Leagues with a stream appear here.</p>
              ) : (
                <ul className="sx-group__list">
                  {leagues.map((item) => (
                    <li key={item.key}>
                      <button type="button" aria-pressed={league === item.key} title={item.country ? `${item.name} · ${item.country}` : item.name}
                        onClick={() => { setLeague(league === item.key ? null : item.key); if (tab === 'bookmarks') setTab('all'); }}
                        className={`sx-group__item${league === item.key ? ' is-active' : ''}`}>
                        <Thumb src={item.logo} className="sx-group__logo" />
                        <span>{item.name}</span>
                        <em>{item.matches}</em>
                      </button>
                    </li>
                  ))}
                  {board.leagues.length > LEAGUE_ROWS && (
                    <li>
                      <button type="button" className="sx-group__more" onClick={() => setAllLeagues((all) => !all)}>
                        {allLeagues ? 'Fewer leagues' : `All ${board.leagues.length} leagues`}
                      </button>
                    </li>
                  )}
                </ul>
              )
            )}
          </section>

          <section className="sx-group">
            <button type="button" className="sx-group__head" aria-expanded={clubsOpen} onClick={() => setClubsOpen((open) => !open)}>
              <span>Favourite Club</span>
              {clubsOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </button>
            {clubsOpen && (
              saved.clubs.length === 0 ? (
                <p className="sx-group__empty">Open a match’s info and star a club to follow it here.</p>
              ) : (
                <ul className="sx-group__list">
                  {saved.clubs.map((name) => (
                    <li key={name}>
                      <button type="button" aria-pressed={club === name} onClick={() => { setClub(club === name ? null : name); if (tab !== 'all') setTab('all'); }}
                        className={`sx-group__item${club === name ? ' is-active' : ''}`}>
                        <Crest team={clubBadge(name)} size="sm" />
                        <span>{name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </section>
        </aside>

        <div className="sx-centre">
          <h1 className="sx-title">Streaming Now</h1>

          <section ref={playerRef} className="sx-player" data-playing={playing || clip ? 'true' : 'false'} aria-label="Stream player">
            <div ref={stageRef} className="sx-player__stage">
              {clip && !clipFailed ? (
                // A highlight from the rail. No `autoplay`: it is started from the reader's press.
                <video
                  key={clip.id}
                  ref={clipRef}
                  src={playableClipFile(clip.mp4) ?? undefined}
                  poster={clip.thumbnail ?? undefined}
                  controls
                  playsInline
                  preload="auto"
                  aria-label={clip.title}
                  data-clip-player={clip.id}
                  className="sx-player__frame sx-player__clip"
                  onError={clipError}
                />
              ) : clip ? (
                <>
                  <img className="sx-player__bg" src="/sports/hero-soccer.webp" alt="" decoding="async" />
                  <span aria-hidden="true" className="sx-player__veil" />
                  <div className="sx-player__note" role="status">
                    <p>This highlight could not be played here.</p>
                    <small>Some clips are limited to certain countries by their publisher.</small>
                    <Link href={clip.href} prefetch={false} className="sx-btn">Open the clip&apos;s page</Link>
                  </div>
                </>
              ) : playing && source ? (
                <iframe
                  key={source.embedUrl}
                  src={source.embedUrl}
                  title={selected ? `${selected.home.name} vs ${selected.away.name} — live stream` : 'Live stream'}
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="sx-player__frame"
                />
              ) : (
                <>
                  <img className="sx-player__bg" src="/sports/hero-soccer.webp" alt="" decoding="async" />
                  <span aria-hidden="true" className="sx-player__veil" />
                  {selected ? (
                    <div className="sx-player__chips">
                      <span className="sx-chip sx-chip--score">
                        <span className="sx-chip__code">{selected.home.code}</span>
                        <Crest team={selected.home} size="sm" />
                        <b>{streamScore(selected)}</b>
                        <Crest team={selected.away} size="sm" />
                        <span className="sx-chip__code">{selected.away.code}</span>
                      </span>
                      <span className="sx-chip sx-chip--clock">{selectedClock}</span>
                      <span className="sx-chip sx-chip--league" title={selected.league}>
                        <Trophy aria-hidden="true" />
                        <span>{selected.league}</span>
                      </span>
                      <span className={`sx-chip sx-chip--status${selected.status === 'live' ? ' is-live' : ''}`}>
                        <i aria-hidden="true" />
                        {selected.status === 'live' ? 'Live' : selected.status === 'upcoming' ? 'Upcoming' : selected.status === 'finished' ? 'Finished' : selected.statusDetail || 'Off'}
                      </span>
                    </div>
                  ) : null}

                  <div className="sx-player__note" role="status">
                    {playing && detail?.state === 'loading' ? (
                      <p><LoaderCircle aria-hidden="true" className="sx-spin" /> Finding a stream…</p>
                    ) : playing && detail && detail.state !== 'ok' ? (
                      <>
                        <p>{STATE_MESSAGE[detail.state as Exclude<StreamState, 'ok'>]?.title ?? 'The stream could not be opened'}</p>
                        <button type="button" className="sx-btn" onClick={() => selected && void loadDetail(selected.id, true)}><RefreshCw aria-hidden="true" /> Try again</button>
                      </>
                    ) : playing && detail?.state === 'ok' && sources.length === 0 ? (
                      <>
                        <p>No stream source is listed for this match yet.</p>
                        <small>Sources usually appear in the last minutes before kick-off.</small>
                        <button type="button" className="sx-btn" onClick={() => selected && void loadDetail(selected.id, true)}><RefreshCw aria-hidden="true" /> Check again</button>
                      </>
                    ) : !selected ? (
                      <>
                        <p>{trouble ? trouble.title : 'No match with a stream right now'}</p>
                        <small>{trouble ? trouble.detail : 'Streams are listed close to kick-off. The list below updates by itself.'}</small>
                      </>
                    ) : watchable ? (
                      <button type="button" className="sx-player__big" onClick={play} aria-label={`Play ${selected.home.name} vs ${selected.away.name}`}>
                        <Play aria-hidden="true" />
                      </button>
                    ) : selected.status === 'upcoming' ? (
                      <>
                        <p>Starts {hydrated ? kickoffShort(selected.startAt, true) : 'soon'}</p>
                        <small>The stream opens about 30 minutes before kick-off.</small>
                      </>
                    ) : (
                      <p>{selected.status === 'finished' ? 'This match has finished.' : selected.hasStream ? 'This match is not being played right now.' : 'No stream is listed for this match.'}</p>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="sx-player__bar">
              {clip ? (
                <button type="button" className="sx-bar-btn" onClick={closeClip} aria-label="Close the highlight" title="Close"><Square aria-hidden="true" /></button>
              ) : playing ? (
                <button type="button" className="sx-bar-btn" onClick={stop} aria-label="Stop the stream" title="Stop"><Square aria-hidden="true" /></button>
              ) : (
                <button type="button" className="sx-bar-btn" onClick={play} disabled={!watchable} aria-label="Play the stream" title={watchable ? 'Play' : 'Not available yet'}><Play aria-hidden="true" /></button>
              )}
              {clip ? (
                // A clip is not a live broadcast: the bar names it and says what it is.
                <>
                  <span className="sx-player__now sx-player__now--clip" title={clip.title}>{clip.title}</span>
                  <span className="sx-player__live"><i aria-hidden="true" />Highlight</span>
                </>
              ) : (
                <>
                  {playing && selected ? (
                    <span className="sx-player__now" title={selected.title}>{selected.home.code} {streamScore(selected)} {selected.away.code} · {selectedClock}</span>
                  ) : null}
                  <span aria-hidden="true" className={`sx-player__line${selected?.status === 'live' ? ' is-live' : ''}`}><i /></span>
                  <span className={`sx-player__live${selected?.status === 'live' ? ' is-live' : ''}`}><i aria-hidden="true" />{selected?.status === 'live' ? 'Live' : 'Off air'}</span>
                </>
              )}
              {!clip && playing && sources.length > 1 ? (
                <span className="sx-sources" role="group" aria-label="Stream source">
                  {sources.map((item, index) => (
                    <button key={item.id + item.embedUrl} type="button" aria-pressed={item === source} onClick={() => setSourceIndex(index)}
                      className={`sx-sources__btn${item === source ? ' is-active' : ''}`} title={item.language ? `${item.label} · ${item.language}` : item.label}>
                      {item.label}{item.hd ? <em>HD</em> : null}
                    </button>
                  ))}
                </span>
              ) : null}
              <button type="button" className="sx-bar-btn" onClick={fullscreen} disabled={clip ? clipFailed : !playing || !source} aria-label="Full screen" title="Full screen"><Maximize aria-hidden="true" /></button>
            </div>
          </section>

          {/* Kept short here: the list of matches below is what the page is for. */}
          <SponsorBanners placement="live" className="sx-sponsor" maxHeight="13rem" />

          <section ref={listRef} className="sx-card" aria-label="Matches" aria-busy={loading}>
            <div className="sx-card__head">
              <div className="sx-tabs" role="group" aria-label="Show">
                {STREAM_TABS.map((item) => (
                  <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={`sx-tabs__tab${tab === item.id ? ' is-active' : ''}`}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="sx-date">
                <button type="button" className="sx-date__pill" onClick={openDatePicker} aria-label={`Change day, showing ${dateLabel}`}>
                  <CalendarDays aria-hidden="true" /><span>{dateLabel}</span>
                </button>
                <input ref={dateRef} type="date" tabIndex={-1} aria-hidden="true" className="sx-date__input" value={date || today} onChange={(event) => changeDate(event.target.value)} />
              </div>
            </div>

            {(league || club || query) && (
              <p className="sx-filter">
                <span>Showing {[league && board.leagues.find((item) => item.key === league)?.name, club, query && `“${query}”`].filter(Boolean).join(' · ')}</span>
                <button type="button" onClick={() => { setLeague(null); setClub(null); setQuery(''); }}><X aria-hidden="true" /> Clear</button>
              </p>
            )}

            {board.stale && <p className="sx-notice">Showing the last list received; the provider did not answer the latest request.</p>}

            {rows.length === 0 ? (
              <div className="sx-empty">
                {loading ? <p><LoaderCircle aria-hidden="true" className="sx-spin" /> Loading matches…</p> : trouble && tab !== 'bookmarks' ? (
                  <><p>{trouble.title}</p><small>{trouble.detail}</small></>
                ) : <p>{emptyLabel}</p>}
              </div>
            ) : (
              <ol className="sx-rows">
                {rows.map((match, index) => {
                  const clock = streamClock(match) ?? (hydrated ? kickoffShort(match.startAt) : '');
                  const marked = bookmarkIds.has(match.id);
                  const info = details[match.id];
                  const facts = info?.result?.detail ?? null;
                  return (
                    <li key={match.id} className={`sx-row${selected?.id === match.id ? ' is-selected' : ''}`} data-stream-match={match.id}>
                      <div className="sx-row__line">
                        <button type="button" className="sx-row__main" onClick={() => select(match)} title={`${match.league}${match.round ? ` · ${match.round}` : ''}`}
                          aria-label={`${match.home.name} ${streamScore(match)} ${match.away.name}, ${match.league}. Show in the player`}>
                          <span className="sx-row__num">{index + 1}.</span>
                          <span className="sx-row__team"><Crest team={match.home} /><span>{match.home.name}</span></span>
                          <span className={`sx-row__score${match.status === 'upcoming' ? ' is-soon' : ''}`}>{streamScore(match)}</span>
                          <span className="sx-row__team sx-row__team--away"><span>{match.away.name}</span><Crest team={match.away} /></span>
                          <span className={`sx-row__clock${match.status === 'live' ? ' is-live' : ''}`}>{clock}</span>
                        </button>
                        <span className="sx-row__actions">
                          <button type="button" className="sx-icon-btn" aria-expanded={infoId === match.id} aria-label="Match information" title="Match information" onClick={() => openInfo(match)}><Info aria-hidden="true" /></button>
                          <button type="button" className={`sx-icon-btn${marked ? ' is-on' : ''}`} aria-pressed={marked} aria-label={marked ? 'Remove bookmark' : 'Bookmark this match'} title={marked ? 'Remove bookmark' : 'Bookmark'} onClick={() => toggleSavedMatch(match)}>
                            {marked ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                          </button>
                          <button type="button" className="sx-icon-btn" disabled={match.status !== 'upcoming' || !match.startAt} aria-label="Add to calendar" title={match.status === 'upcoming' ? 'Add to calendar' : 'Already started'} onClick={() => addToCalendar(match)}><CalendarPlus aria-hidden="true" /></button>
                        </span>
                      </div>
                      {infoId === match.id && (
                        <div className="sx-info">
                          <dl>
                            <div><dt>Competition</dt><dd>{[match.league, match.country, facts?.season, match.round ?? facts?.round].filter(Boolean).join(' · ')}</dd></div>
                            <div><dt>Kick-off</dt><dd>{hydrated ? kickoffShort(match.startAt, true) : '—'}{match.statusDetail ? ` · ${match.statusDetail}` : ''}</dd></div>
                            {facts?.venue && <div><dt>Venue</dt><dd>{[facts.venue.stadium, facts.venue.city, facts.venue.capacity ? `${facts.venue.capacity.toLocaleString('en-US')} seats` : null].filter(Boolean).join(' · ')}</dd></div>}
                            {facts?.referee && <div><dt>Referee</dt><dd>{facts.referee}</dd></div>}
                            {(facts?.managers.home || facts?.managers.away) && <div><dt>Managers</dt><dd>{[facts.managers.home, facts.managers.away].filter(Boolean).join(' · ')}</dd></div>}
                            {facts && <div><dt>Streams</dt><dd>{facts.sources.length ? facts.sources.map((item) => `${item.label}${item.hd ? ' HD' : ''}`).join(', ') : 'None listed yet'}</dd></div>}
                          </dl>
                          {info?.state === 'loading' && <p className="sx-info__state"><LoaderCircle aria-hidden="true" className="sx-spin" /> Loading match details…</p>}
                          {info && info.state !== 'loading' && info.state !== 'ok' && (
                            <p className="sx-info__state">Match details could not be loaded. <button type="button" onClick={() => void loadDetail(match.id, true)}>Try again</button></p>
                          )}
                          <div className="sx-info__clubs">
                            {[match.home, match.away].map((team) => {
                              const on = saved.clubs.some((name) => name.toLowerCase() === team.name.toLowerCase());
                              return (
                                <button key={team.name} type="button" aria-pressed={on} className={`sx-star${on ? ' is-on' : ''}`} onClick={() => { toggleFavouriteClub(team.name); setClubsOpen(true); }}>
                                  <Star aria-hidden="true" /> {on ? 'Following' : 'Follow'} {team.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}

            {tab === 'bookmarks' && saved.news.length > 0 && (
              <div className="sx-saved-news">
                <h2>Saved news</h2>
                <ul>
                  {saved.news.map((item) => (
                    <li key={item.id}>
                      <a href={item.href} target="_blank" rel="noopener noreferrer">{item.title}</a>
                      <button type="button" className="sx-icon-btn is-on" aria-label="Remove bookmark" title="Remove bookmark" onClick={() => toggleSavedNews(item)}><BookmarkCheck aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside className="sx-rail" aria-label="News and highlights">
          <section ref={newsRef} tabIndex={-1} className="sx-rail__block" aria-labelledby="sx-news-title">
            <div className="sx-rail__head">
              <h2 id="sx-news-title">Latest News</h2>
              {sportNews.length > RAIL_ROWS && (
                <button type="button" onClick={() => setAllNews((all) => !all)} aria-expanded={allNews}>{allNews ? 'Show less' : 'See All'}</button>
              )}
            </div>
            {sportNews.length === 0 ? (
              <p className="sx-rail__empty">No news to show right now.</p>
            ) : (
              <ul className="sx-news">
                {(allNews ? sportNews : sportNews.slice(0, RAIL_ROWS)).map((item) => {
                  const on = savedNewsIds.has(item.id);
                  return (
                    <li key={item.id}>
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className="sx-news__link">
                        <Thumb src={item.thumbnail} className="sx-news__thumb" />
                        <span className="sx-news__text">
                          <span className="sx-news__title">{item.title}</span>
                          {item.date && <time dateTime={item.date}>{newsDate(item.date)}</time>}
                        </span>
                      </a>
                      <button type="button" className={`sx-icon-btn${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={on ? 'Remove bookmark' : 'Bookmark this story'} title={on ? 'Remove bookmark' : 'Bookmark'}
                        onClick={() => toggleSavedNews({ id: item.id, title: item.title, href: item.href, thumbnail: item.thumbnail, date: item.date })}>
                        {on ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="sx-rail__block" aria-labelledby="sx-highlights-title">
            <div className="sx-rail__head">
              <h2 id="sx-highlights-title">Latest Highlights</h2>
              <Link href="/sports/highlights">See All</Link>
            </div>
            {highlights.length === 0 ? (
              <p className="sx-rail__empty">No highlights to show right now.</p>
            ) : (
              // Pressing a clip plays it in the large player above.
              <StreamHighlightClips items={highlights.slice(0, RAIL_ROWS)} activeId={clip && !clipFailed ? clip.id : null} unplayable={unplayableClips} onPlay={playClip} />
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
