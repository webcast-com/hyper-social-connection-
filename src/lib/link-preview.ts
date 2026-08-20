export type LinkPreviewData = {
  url: string;
  domain: string;
  title: string;
  description: string;
  image: string | null;
  favicon: string | null;
};

// Fallback metadata for common domains if external network is restricted
const KNOWN_DOMAINS: Record<string, Partial<LinkPreviewData>> = {
  'github.com': {
    title: 'GitHub: Let’s build from here',
    description: 'GitHub is where over 100 million developers shape the future of software, together.',
    image: 'https://github.githubassets.com/images/modules/open_graph/github-logo.png',
  },
  'nextjs.org': {
    title: 'Next.js by Vercel — The React Framework for the Web',
    description: 'Used by some of the world’s largest companies, Next.js enables you to create high-quality full-stack web applications.',
    image: 'https://nextjs.org/og.png',
  },
  'prisma.io': {
    title: 'Prisma — Next-generation Node.js and TypeScript ORM',
    description: 'Type-safe database access with intuitive data modeling, migrations and auto-completion.',
    image: 'https://prisma.io/img/og-image.png',
  },
  'tailwindcss.com': {
    title: 'Tailwind CSS - Rapidly build modern websites without leaving your HTML',
    description: 'A utility-first CSS framework packed with classes like flex, pt-4, text-center and rotate-90.',
    image: 'https://tailwindcss.com/api/og',
  },
  'youtube.com': {
    title: 'YouTube',
    description: 'Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world.',
    image: 'https://www.youtube.com/img/desktop/yt_1200.png',
  },
};

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  const matches = text.match(urlRegex);
  return matches ? Array.from(new Set(matches)) : [];
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  try {
    const urlObj = new URL(rawUrl);
    const domain = urlObj.hostname.replace(/^www\./, '');
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

    const fallback: LinkPreviewData = {
      url: rawUrl,
      domain,
      title: KNOWN_DOMAINS[domain]?.title || `${domain} — Read more on ${domain}`,
      description: KNOWN_DOMAINS[domain]?.description || `Explore content and conversations on ${domain}.`,
      image: KNOWN_DOMAINS[domain]?.image || null,
      favicon,
    };

    // Attempt lightweight fetch with 2.5s abort timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const res = await fetch(rawUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HyperBot/1.0; +https://hyper.social)',
          Accept: 'text/html',
        },
      });
      clearTimeout(timeout);

      if (!res.ok) return fallback;

      const html = await res.text();

      // Extract OpenGraph or fallback meta tags
      const ogTitle =
        html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i)?.[1] ||
        html.match(/<meta\s+name=["']twitter:title["']\s+content=["'](.*?)["']/i)?.[1] ||
        html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1];

      const ogDesc =
        html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i)?.[1] ||
        html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i)?.[1] ||
        html.match(/<meta\s+name=["']twitter:description["']\s+content=["'](.*?)["']/i)?.[1];

      const ogImage =
        html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i)?.[1] ||
        html.match(/<meta\s+name=["']twitter:image["']\s+content=["'](.*?)["']/i)?.[1];

      let cleanImage = ogImage || fallback.image;
      if (cleanImage && cleanImage.startsWith('/')) {
        cleanImage = `${urlObj.protocol}//${urlObj.host}${cleanImage}`;
      }

      return {
        url: rawUrl,
        domain,
        title: ogTitle ? decodeHtmlEntities(ogTitle) : fallback.title,
        description: ogDesc ? decodeHtmlEntities(ogDesc) : fallback.description,
        image: cleanImage,
        favicon,
      };
    } catch {
      clearTimeout(timeout);
      return fallback;
    }
  } catch {
    return null;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–');
}
