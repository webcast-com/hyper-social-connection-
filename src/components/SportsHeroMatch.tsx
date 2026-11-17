'use client';

import { Fragment, useCallback, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Clock, MapPin } from 'lucide-react';
import { heroBackdrop, heroFootnote, heroStatus } from '@/lib/hero-match';
import { broadcastLabel, kickoffLabel, scoreCardClock, scoreCell } from '@/lib/score-card';
import type { SportsEvent } from '@/lib/sports';

const noop = () => () => {};
/** False on the server and during hydration, true afterwards — when the viewer's time zone is known. */
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * A side's crest: the provider's logo, or the side's code on a filled crest when
 * there is no logo or it does not load. This is the dashboard's `TeamLogo`.
 */
function Crest({ team }: { team: SportsEvent['home'] }) {
  const [failed, setFailed] = useState<string | null>(null);
  const logo = team.logo ?? null;
  // The page is server-rendered, so a logo can fail before React is listening
  // for it: an image that has already finished with nothing in it failed too.
  const check = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setFailed(logo);
  }, [logo]);
  if (!logo || logo === failed) {
    return (
      <span aria-hidden="true" data-team-crest className="score-hero__crest score-hero__crest--code">
        {(team.short?.trim() || team.name).slice(0, 4).toUpperCase()}
      </span>
    );
  }
  return (
    <img ref={check} src={logo} alt="" data-team-logo onError={() => setFailed(logo)} className="score-hero__crest" />
  );
}

/**
 * The clock's words. "Today · 19:30" and "3rd · 08:41" are two facts, so the
 * small layout stacks them rather than break the line wherever it runs out.
 */
function ClockText({ label }: { label: string }) {
  return label.split(' · ').map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <span aria-hidden="true" className="score-hero__sep">·</span>}
      <span>{part}</span>
    </Fragment>
  ));
}

function Side({ team }: { team: SportsEvent['home'] }) {
  return (
    <div className="score-hero__side">
      <Crest team={team} />
      <div title={team.name} className="score-hero__team">{team.name}</div>
      <div data-hero-score className="score-hero__score">{scoreCell(team.score)}</div>
    </div>
  );
}

/**
 * The match centre's first fixture as a hero, after the NFL & basketball
 * dashboard's `FeaturedGame`: a photograph under a dark veil, the status and the
 * competition across the top, a crest, name and score either side of the clock,
 * and the broadcaster underneath.
 *
 * Home is first, as it is on the dashboard and on the feed's score card. The
 * whole hero is one link — to the match page when the provider gave the fixture
 * one, otherwise to the board — so it is never a dead click.
 *
 * A kickoff is a time of day, so it is written only once the page has hydrated
 * and the viewer's own zone is known; until then the hero says "Upcoming" rather
 * than show the server's clock as if it were the reader's.
 */
export default function SportsHeroMatch({ event, href }: { event: SportsEvent; href: string }) {
  const hydrated = useHydrated();
  const status = heroStatus(event);
  const clock = scoreCardClock(event);
  const kickoff = hydrated ? kickoffLabel(event.startAt) : null;
  const clockLabel = clock.tone === 'soon' ? kickoff ?? 'Upcoming' : clock.label;
  const venue = event.venue?.trim() || '';
  const spoken = event.race
    ? `${event.race.title}, ${event.leagueName}`
    : `${event.home.name} ${event.home.score ?? 'no score yet'}, ${event.away.name} ${event.away.score ?? 'no score yet'}, ${event.leagueName}`;

  return (
    <Link href={href} prefetch={false} data-hero-match={event.id}
      aria-label={`${status.label}: ${spoken}. Open match details`}
      className="score-hero focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
      <img className="score-hero__bg" src={heroBackdrop(event)} alt="" decoding="async" />
      <span aria-hidden="true" className="score-hero__veil" />

      <div className="score-hero__top">
        <span className={`score-hero__pill${status.live ? ' is-live' : ''}`}><i aria-hidden="true" />{status.label}</span>
        <span className="score-hero__comp">{event.leagueName}</span>
      </div>

      {event.race ? (
        <div className="score-hero__race">
          <p className="score-hero__race-title">{event.race.title}</p>
          {event.race.entries.length > 0 && (
            <ol aria-label="Reported race positions">
              {event.race.entries.slice(0, 3).map((entry, index) => (
                <li key={`${entry.name}-${index}`}>
                  <span>{entry.position ? `#${entry.position}` : '–'}</span>{entry.name}
                </li>
              ))}
            </ol>
          )}
          <span className={`score-hero__clock${clock.tone === 'live' ? ' is-live' : ''}`}><ClockText label={clockLabel} /></span>
        </div>
      ) : (
        <div className="score-hero__match">
          <Side team={event.home} />
          <div className="score-hero__mid">
            <span aria-hidden="true" className="score-hero__vs">V/S</span>
            <span data-hero-clock className={`score-hero__clock${clock.tone === 'live' ? ' is-live' : ''}`}><ClockText label={clockLabel} /></span>
            {venue && <span className="score-hero__venue">{venue}</span>}
          </div>
          <Side team={event.away} />
        </div>
      )}

      <div className="score-hero__foot">
        <span data-broadcast className="score-hero__chip"><i aria-hidden="true" className="score-hero__tv" />{broadcastLabel(event)}</span>
        <span className="score-hero__chip score-hero__chip--muted">
          <Clock aria-hidden="true" className="h-[13px] w-[13px] shrink-0" />
          {heroFootnote(event, clock, kickoff)}
        </span>
        {venue && (
          <span className="score-hero__chip score-hero__chip--muted score-hero__chip--venue">
            <MapPin aria-hidden="true" className="h-[13px] w-[13px] shrink-0" />
            <span>{venue}</span>
          </span>
        )}
      </div>
    </Link>
  );
}
