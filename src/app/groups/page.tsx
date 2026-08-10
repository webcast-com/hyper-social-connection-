import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/db';
import { groups, users, groupMembers } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import CreateGroupButton from '@/components/CreateGroupButton';
import { Users, Check, Compass } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Communities and Groups',
  description: 'Explore Hyper communities and find a group for the things you care about.',
  alternates: { canonical: '/groups' },
  openGraph: {
    title: 'Communities and Groups | Hyper',
    description: 'Explore Hyper communities and find a group for the things you care about.',
    url: '/groups',
    images: ['/og-image.png'],
  },
};

export default async function GroupsPage() {
  const viewer = await getViewer();

  let allGroups: any[] = [];
  let memberships: { groupId: number; user: any }[] = [];
  if (hasDatabase) {
    try {
      allGroups = await db.select().from(groups).orderBy(desc(groups.createdAt));
      memberships = await db
        .select({ groupId: groupMembers.groupId, user: users })
        .from(groupMembers)
        .leftJoin(users, eq(groupMembers.userId, users.id));
    } catch (err) {
      console.warn('[groups] DB query failed:', (err as Error)?.message);
    }
  }

  const membersByGroup = new Map<number, any[]>();
  for (const m of memberships) {
    if (!membersByGroup.has(m.groupId)) membersByGroup.set(m.groupId, []);
    if (m.user) membersByGroup.get(m.groupId)!.push(m.user);
  }
  const joinedIds = new Set(
    viewer ? memberships.filter((m) => m.user?.id === viewer.id).map((m) => m.groupId) : [],
  );

  const yourGroups = allGroups.filter((g) => joinedIds.has(g.id));
  const discoverGroups = allGroups.filter((g) => !joinedIds.has(g.id));

  const GroupCard = ({ group, joined }: { group: any; joined: boolean }) => {
    const memberList = membersByGroup.get(group.id) || [];
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden group border border-gray-100 dark:border-gray-700/60 flex flex-col">
        <Link href={`/groups/${group.id}`} className="block h-32 bg-gradient-to-r from-blue-400 to-indigo-500 relative">
          {group.coverPhoto && (
            <img src={group.coverPhoto} alt={`${group.name} cover`} className="w-full h-full object-cover" />
          )}
          {joined && (
            <span className="absolute top-2 right-2 bg-green-500/95 text-white text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow">
              <Check className="w-3 h-3" /> Joined
            </span>
          )}
        </Link>
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-bold text-lg mb-1 text-gray-900 dark:text-white truncate">{group.name}</h3>
          <p className="text-gray-500 dark:text-gray-400 text-xs mb-3 line-clamp-2 flex-1">
            {group.description || 'A community for shared interests.'}
          </p>
          {memberList.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="flex -space-x-2">
                {memberList.slice(0, 4).map((u, i) =>
                  u.avatar ? (
                    <img
                      key={`${u.id}-${i}`}
                      src={u.avatar}
                      alt={u.name}
                      className="w-6 h-6 rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
                    />
                  ) : (
                    <span
                      key={`${u.id}-${i}`}
                      className="w-6 h-6 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-800"
                    >
                      {u.name?.charAt(0) || 'U'}
                    </span>
                  ),
                )}
              </span>
              <span className="text-[11px] text-gray-400 font-medium">
                {memberList.length} member{memberList.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <Link
            href={`/groups/${group.id}`}
            className="block text-center w-full bg-gray-100 dark:bg-gray-700/80 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            {joined ? 'Open Group' : 'View Group'}
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-4 mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
          <Users className="text-blue-600 shrink-0" /> Groups
        </h1>
        <CreateGroupButton />
      </div>

      {allGroups.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 p-12 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Compass className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">No groups yet</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-sm mx-auto">
            Create the first community and invite people who share your interests.
          </p>
        </div>
      ) : (
        <>
          {yourGroups.length > 0 && (
            <>
              <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Your groups · {yourGroups.length}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                {yourGroups.map((g) => (
                  <GroupCard key={g.id} group={g} joined={true} />
                ))}
              </div>
            </>
          )}

          {discoverGroups.length > 0 && (
            <>
              <h2 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Discover groups
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {discoverGroups.map((g) => (
                  <GroupCard key={g.id} group={g} joined={false} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
