import Link from 'next/link';

/**
 * The Hyper brand lockup.
 *
 * Renders the wordmark SVG (`public/logo-wordmark.svg`) rather than live text
 * so the brand is identical regardless of whether the Poppins webfont has
 * loaded — the previous text lockup shifted to a fallback family on slow or
 * blocked font requests. The SVG carries its own gradient, so it needs no
 * dark-mode variant.
 *
 * `priority`-free plain <img>: the file is ~2 KB and inlined by the browser
 * cache immediately; next/image would add a proxy hop for a static vector.
 */
export default function BrandLogo({
  href = '/',
  className = '',
  ariaLabel = 'Hyper — Home',
}: {
  href?: string | null;
  className?: string;
  ariaLabel?: string;
}) {
  const img = (
    <img
      src="/logo-wordmark.svg"
      alt="Hyper"
      width={651}
      height={242}
      className={`h-7 w-auto select-none ${className}`}
      draggable={false}
    />
  );

  if (!href) return img;

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="shrink-0 hover:scale-105 transition-transform"
    >
      {img}
    </Link>
  );
}
