/**
 * Live trending topics — computes the most-used #hashtags from post content
 * server-side, so the "Trending Topics" widget reflects real activity.
 *
 * Pure and dependency-free: works identically on demo data (offline mode)
 * and on real rows from the database.
 */

export type TrendingTopic = {
  tag: string;
  category: string;
  postsCount: number;
};

/** Keyword → display category. First match wins; fallback is generic. */
const CATEGORY_RULES: { keywords: RegExp; category: string }[] = [
  { keywords: /(nextjs|react|webdev|typescript|javascript|coding|programming|opensource|ai|tech|dev|software|tailwind|supabase|node|css)/i, category: 'Technology · Trending' },
  { keywords: /(travel|photography|photo|nature|alps|hiking|adventure|beach|vacation)/i, category: 'Travel & Photography' },
  { keywords: /(art|digitalart|design|illustration|drawing|painting|creative)/i, category: 'Art & Design' },
  { keywords: /(fitness|gym|workout|health|wellness|running|yoga|motivation)/i, category: 'Health & Fitness' },
  { keywords: /(music|song|album|acoustic|concert|producer|beats)/i, category: 'Music & Audio' },
  { keywords: /(food|recipe|cooking|coffee|restaurant|baking)/i, category: 'Food & Drink' },
  { keywords: /(game|gaming|esports|stream|twitch)/i, category: 'Gaming' },
  { keywords: /(news|politics|world)/i, category: 'News' },
  { keywords: /(sport|football|soccer|nba|tennis|cricket)/i, category: 'Sports' },
];

const HASHTAG_RE = /#([\p{L}\p{N}_]{2,30})/gu;

function categorize(tag: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(tag)) return rule.category;
  }
  return 'Trending on Hyper';
}

/**
 * Extracts hashtags from a set of posts, counts usage and returns the top
 * `limit` tags ordered by frequency (ties broken alphabetically).
 */
export function computeTrendingTopics(
  posts: { content?: string | null }[],
  limit = 5,
): TrendingTopic[] {
  const counts = new Map<string, { tag: string; count: number }>();

  for (const post of posts) {
    const content = post?.content;
    if (!content) continue;
    const seenInPost = new Set<string>(); // count each tag once per post
    for (const match of content.matchAll(HASHTAG_RE)) {
      const raw = match[1];
      const key = raw.toLowerCase();
      if (seenInPost.has(key)) continue;
      seenInPost.add(key);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag: `#${raw}`, count: 1 });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit)
    .map((e) => ({ tag: e.tag, category: categorize(e.tag), postsCount: e.count }));
}
