import { getViewer } from '@/lib/viewer';
import { db, hasDatabase } from '@/db';
import { users, groups, groupMembers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { joinGroup } from '@/app/actions';
import { Users, Crown, ArrowLeft } from 'lucide-react';

export default async function GroupDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const { id } = await params;

  const groupId = parseInt(id);
  let groupRes: any[] = [];
  let members: any[] = [];
  let admin: any = null;
  let group: any = null;
  if (hasDatabase) {
    try {
      groupRes = await db.select().from(groups).where(eq(groups.id, groupId));
      if (groupRes.length === 0) redirect('/groups');
      group = groupRes[0];

      members = await db.select({ user: users }).from(groupMembers)
        .leftJoin(users, eq(groupMembers.userId, users.id))
        .where(eq(groupMembers.groupId, groupId));

      const adminRes = await db.select().from(users).where(eq(users.id, group.adminId));
      admin = adminRes[0];
    } catch (err) {
      console.warn('[group detail] DB query failed:', (err as Error)?.message);
      if (!group) {
        group = { id: groupId, name: 'Demo Group', description: 'Database is offline — showing placeholder data. Configure DATABASE_URL in .env.local to see real groups.', coverPhoto: null, adminId: viewer.id };
        members = [{ user: viewer }];
      }
    }
  } else {
    group = { id: groupId, name: 'Demo Group', description: 'Database is offline — showing placeholder data. Configure DATABASE_URL in .env.local to see real groups.', coverPhoto: null, adminId: viewer.id };
    members = [{ user: viewer }];
  }

  const isMember = members.some((m: any) => m.user?.id === viewer.id);

  return (
    <div className="max-w-5xl mx-auto p-4 mt-6">
      <Link href="/groups" className="inline-flex items-center gap-2 text-blue-600 hover:underline mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Groups
      </Link>

      <div className="bg-white rounded-2xl shadow overflow-hidden mb-6">
        <div className="h-56 relative">
          {group.coverPhoto ? (
            <img src={group.coverPhoto} className="w-full h-full object-cover" alt={group.name} />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-blue-500 to-indigo-600" />
          )}
        </div>
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{group.name}</h1>
              <p className="text-gray-500 mt-1">{group.description}</p>
              <p className="text-sm text-gray-400 mt-2 flex items-center gap-1">
                <Users className="w-4 h-4" /> {members.length} member{members.length !== 1 ? 's' : ''}
              </p>
            </div>
            {!isMember && (
              <form action={async () => { 'use server'; await joinGroup(groupId); }}>
                <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                  + Join Group
                </button>
              </form>
            )}
            {isMember && (
              <span className="bg-green-100 text-green-700 px-4 py-2 rounded-lg font-semibold">✓ Member</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="bg-white rounded-2xl shadow p-6">
            <h2 className="font-bold text-xl mb-4">About this Group</h2>
            <p className="text-gray-700">{group.description || 'A community for shared interests and discussions.'}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow p-6">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Users className="text-blue-500 w-5 h-5" /> Members
            </h3>
            <div className="space-y-3">
              {members.map(({ user: u }) => u && (
                <Link key={u.id} href={`/profile/${u.id}`} className="flex items-center space-x-3 hover:bg-gray-50 rounded-lg p-1 transition-colors">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold shrink-0">
                      {u.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{u.name}</div>
                    {u.id === group.adminId && (
                      <div className="flex items-center gap-1 text-xs text-yellow-600">
                        <Crown className="w-3 h-3 shrink-0" /> Admin
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
