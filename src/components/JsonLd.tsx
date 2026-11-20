import { jsonLdText } from '@/lib/structured-data';

/**
 * One or more schema.org objects as `application/ld+json`. Entries that are null
 * (a builder with nothing to say) are skipped, and nothing at all is rendered
 * when none is left. A server component: the markup is in the HTML a crawler
 * reads, and no script runs for it.
 */
export default function JsonLd({ data }: { data: (Record<string, unknown> | null | undefined)[] | Record<string, unknown> | null | undefined }) {
  const entries = (Array.isArray(data) ? data : [data]).filter((entry): entry is Record<string, unknown> => !!entry);
  if (entries.length === 0) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdText(entries.length === 1 ? entries[0] : entries) }}
    />
  );
}
