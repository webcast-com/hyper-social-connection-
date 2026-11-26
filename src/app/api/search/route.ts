import { NextRequest, NextResponse } from 'next/server';
import { getSportsBoard } from '@/lib/sports';
import { getEspnOdds } from '@/lib/espn-odds-feed';
import { oddsFeedPredictions } from '@/lib/odds-feed-predictions';
import { getSportsNews } from '@/lib/espn-news-feed';
import { ESPN_LEAGUES } from '@/lib/sports-catalog';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  if (!q) {
    return NextResponse.json({ matches: [], predictions: [], news: [], groups: [] });
  }

  const [boardRes, oddsRes, newsRes] = await Promise.allSettled([
    getSportsBoard(),
    getEspnOdds(),
    getSportsNews(ESPN_LEAGUES.filter((l) => ['epl', 'nba', 'nfl', 'ucl'].includes(l.slug))),
  ]);

  const matches =
    boardRes.status === 'fulfilled'
      ? boardRes.value.events
          .filter((e) =>
            [e.home?.name, e.away?.name, e.leagueName, e.league, e.sport]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
          )
          .slice(0, 8)
      : [];

  const predictions =
    oddsRes.status === 'fulfilled'
      ? oddsFeedPredictions(oddsRes.value, 40)
          .filter((p) =>
            [p.homeTeam, p.awayTeam, p.competition, p.federation, p.prediction]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
          )
          .slice(0, 8)
      : [];

  const news =
    newsRes.status === 'fulfilled' && newsRes.value?.articles
      ? newsRes.value.articles
          .filter((a) =>
            [a.headline, a.description, a.leagueName]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
          )
          .slice(0, 6)
      : [];

  const groups: any[] = [];

  return NextResponse.json({ matches, predictions, news, groups });
}
