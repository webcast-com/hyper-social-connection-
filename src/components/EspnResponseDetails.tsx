import type { EspnResponseMetadata } from '@/lib/espn-endpoints';

/** Show allowlisted header clues, never raw denial HTML or arbitrary headers. */
export default function EspnResponseDetails({ metadata }: { metadata?: EspnResponseMetadata }) {
  if (!metadata) return null;
  const rows = [
    ['Response server', metadata.server], ['Via', metadata.via],
    ['Content type', metadata.contentType], ['Proxy block reason', metadata.proxyBlockReason],
  ].filter(([, value]) => value);
  if (!rows.length) return null;
  return <dl className="mt-1 space-y-1 text-[11px]">
    {rows.map(([label, value]) => <div key={label} className="break-all"><dt className="inline font-semibold">{label}: </dt><dd className="inline">{value}</dd></div>)}
  </dl>;
}
