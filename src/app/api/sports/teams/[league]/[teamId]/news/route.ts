import { NextRequest, NextResponse } from 'next/server';
import { ESPN_REQUEST_HEADERS, espnFailureDetails } from '@/lib/espn-endpoints';
import { filterTeamArticles, type TeamNewsSource } from '@/lib/espn-team-news';
import { newsUrl, parseNews, type SportsNewsArticle } from '@/lib/espn-news';
import { parseTeamInfo, resolveTeam } from '@/lib/espn-team';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

/** Team-name-filtered league articles. Injury and transfer lists are not inferred from articles. */
export async function GET(_request: NextRequest, context: { params: Promise<{ league: string; teamId: string }> }) {
  let resolved;
  try {
    const { league, teamId } = await context.params;
    resolved = resolveTeam(league, teamId);
  } catch {
    return NextResponse.json({ error: 'Unknown team.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const { meta, reference, urls } = resolved;
  const url = newsUrl(meta);
  let attemptedUrl = urls.info;
  const sources: TeamNewsSource[] = [];
  const articles: SportsNewsArticle[] = [];
  try {
    // One identity request is enough to safely match articles; do not fetch an
    // unrelated schedule and roster just to determine the team's name.
    const response = await fetch(urls.info, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      sources.push({ kind: 'articles', ok: false, url: urls.info, httpStatus: response.status, error: `ESPN team identity HTTP ${response.status}` });
    } else {
      const team = parseTeamInfo(await response.json(), reference);
      if (!team) {
        sources.push({ kind: 'articles', ok: false, url: urls.info, httpStatus: response.status, error: 'Team identity unavailable; articles cannot be matched to this team' });
      } else {
        attemptedUrl = url;
        const newsResponse = await fetch(url, { headers: ESPN_REQUEST_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
        if (!newsResponse.ok) {
          await newsResponse.body?.cancel().catch(() => undefined);
          sources.push({ kind: 'articles', ok: false, url, httpStatus: newsResponse.status, error: `ESPN HTTP ${newsResponse.status}` });
        } else {
          articles.push(...filterTeamArticles(parseNews(await newsResponse.json(), meta), [team.name]));
          sources.push({ kind: 'articles', ok: true, url, httpStatus: newsResponse.status });
        }
      }
    }
  } catch (error) {
    sources.push({ kind: 'articles', ok: false, ...espnFailureDetails(error, attemptedUrl) });
  }
  return NextResponse.json({ reference, status: sources[0]?.ok ? articles.length ? 'ready' : 'empty' : 'unavailable', fetchedAt: new Date().toISOString(), articles, sources }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' } });
}
