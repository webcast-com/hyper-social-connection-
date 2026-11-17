import Link from 'next/link';
import { Hash, MessageCircle, Sparkles, Trophy, Users } from 'lucide-react';

/**
 * The "Catch up fast" shortcuts at the top of the Groups page on phones and
 * tablets, where there is no sidebar to offer them.
 *
 * Trending, People and Contacts are sections of the home feed, so those tiles
 * open the home page at that section (the sections carry a scroll margin so
 * they land below the fixed top bar). Groups is this page: its tile jumps to the
 * list (`groupsHref`).
 */
const TILE = 'rounded-2xl p-2 text-center ring-1';

export default function QuickAccess({ groupsHref }: { groupsHref: string }) {
  return (
    <section aria-label="Quick access" className="mb-6 overflow-hidden rounded-[1.75rem] border border-blue-100/80 bg-white/90 shadow-sm backdrop-blur lg:hidden dark:border-blue-900/60 dark:bg-slate-900/90">
      <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-fuchsia-600 px-4 py-4 text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-100">Quick access</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[10rem] flex-1">
            {/* Not a heading: the page's own title follows it. */}
            <p className="font-display text-xl font-black tracking-tight sm:text-2xl">Catch up fast</p>
            <p className="text-xs text-blue-100">Scores, trends and your community.</p>
          </div>
          <Link href="/sports" className="shrink-0 rounded-2xl bg-white/20 px-3 py-2 text-xs font-bold backdrop-blur hover:bg-white/30">
            Sports scores
          </Link>
        </div>
      </div>

      <nav aria-label="Quick access shortcuts" className="grid grid-cols-5 gap-1.5 px-3 py-3">
        <Link href="/sports" className={`${TILE} bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60`}>
          <Trophy className="mx-auto h-5 w-5" />
          <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">Sports</span>
        </Link>
        <Link href="/#trending-now" className={`${TILE} bg-orange-50 text-orange-700 ring-orange-100 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900/60`}>
          <Hash className="mx-auto h-5 w-5" />
          <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">Trending</span>
        </Link>
        <a href={groupsHref} className={`${TILE} bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60`}>
          <Users className="mx-auto h-5 w-5" />
          <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">Groups</span>
        </a>
        <Link href="/#people-you-may-know" className={`${TILE} bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:ring-fuchsia-900/60`}>
          <Sparkles className="mx-auto h-5 w-5" />
          <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">People</span>
        </Link>
        <Link href="/#contacts" className={`${TILE} bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60`}>
          <MessageCircle className="mx-auto h-5 w-5" />
          <span className="mt-1 block text-[9px] font-extrabold sm:text-[10px]">Contacts</span>
        </Link>
      </nav>
    </section>
  );
}
