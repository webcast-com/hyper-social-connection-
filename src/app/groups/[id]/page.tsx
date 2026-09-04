import type { Metadata } from 'next';
import { getViewer } from '@/lib/viewer';
import { prisma, hasDatabase } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Users, Crown, ArrowLeft, CalendarDays, Lock } from 'lucide-react';
import CreatePost from '@/components/CreatePost';
import EmptyState from '@/components/EmptyState';
import Post from '@/components/Post';
import GroupMembershipButton from '@/components/GroupMembershipButton';
import GroupAdminControls from '@/components/GroupAdminControls';
import GroupEvents from '@/components/GroupEvents';
import GroupInviteButton from '@/components/GroupInviteButton';
import GroupInviteInbox from '@/components/GroupInviteInbox';
import { getMyGroupInvites } from '@/app/invite-actions';
import { sharedProfileCardData } from '@/lib/profile';
import { StartCallButton } from '@/components/Call/StartCallButton';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const groupId = Number.parseInt(id, 10);
  let group: { name: string; description: string | null; coverPhoto: string | null } | null = null;

  if (hasDatabase && Number.isInteger(groupId)) {
    try {
      group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true, description: true, coverPhoto: true },
      });
    } catch (err) {
      console.warn('[group metadata] DB query failed:', (err as Error)?.message);
    }
  }

  const title = group?.name ? `${group.name} Community` : 'Community Group';
  const description = group?.description || 'Join a Hyper community and connect with people who share your interests.';

  return {
    title,
    description,
    alternates: { canonical: `/groups/${id}` },
    robots: group ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      type: 'website',
      title: `${title} | Hyper`,
      description,
      url: `/groups/${id}`,
      images: [group?.coverPhoto || '/og-image.png'],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Hyper`,
      description,
      images: [group?.coverPhoto || '/og-image.png'],
    },
  };
}

export default async function GroupDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const guest = { id: 0, name: 'Guest', avatar: null } as any;
  const currentUser = viewer || guest;
  const { id } = await params;

  const groupId = parseInt(id);
  let group: any = null;
  let members: any[] = [];
  let groupPosts: any[] = [];
  let bookmarkedIds = new Set<number>();
  let viewerFollowIds = new Set<number>();

  if (hasDatabase) {
    try {
      group = await prisma.group.findUnique({ where: { id: groupId } });
      if (!group) redirect('/groups');

      const memberRows = await prisma.groupMember.findMany({
        where: { groupId },
        include: { user: true },
      });
      members = memberRows.map((m) => ({ user: m.user, role: m.role || 'member' }));

      // ── Group discussion feed (same enrichment pipeline as the home feed) ──
      const rows = await prisma.post.findMany({
        where: { groupId },
        orderBy: { createdAt: 'desc' },
      });

      const allUsers = await prisma.user.findMany();
      const usersById = new Map(allUsers.map((u) => [u.id, u]));

      const postIds = rows.map((p) => p.id);
      const allLikes = postIds.length ? await prisma.like.findMany() : [];
      const allComments = postIds.length
        ? await prisma.comment.findMany({ orderBy: { createdAt: 'desc' } })
        : [];
      const allPolls = postIds.length ? await prisma.poll.findMany() : [];
      const allPollOptions = postIds.length ? await prisma.pollOption.findMany() : [];
      const allPollVotes = postIds.length ? await prisma.pollVote.findMany() : [];

      // Who the viewer follows — used to gate the details (bio/location)
      // shown on shared-profile cards per profile visibility.
      if (viewer?.id) {
        const followRows = await prisma.follow.findMany({
          where: { followerId: viewer.id },
          select: { followingId: true },
        });
        viewerFollowIds = new Set(followRows.map((f) => f.followingId));
      }

      if (viewer?.id) {
        const bks = await prisma.bookmark.findMany({ where: { userId: viewer.id } });
        bookmarkedIds = new Set(bks.map((b) => b.postId));
      }

      const enriched = new Map<number, any>();
      for (const p of rows) {
        let postPoll: any = null;
        const pollRow = allPolls.find((pl) => pl.postId === p.id);
        if (pollRow) {
          const opts = allPollOptions
            .filter((o) => o.pollId === pollRow.id)
            .sort((a, b) => a.position - b.position)
            .map((o) => ({
              id: o.id,
              text: o.text,
              votesCount: allPollVotes.filter((v) => v.optionId === o.id).length,
            }));
          const userVote = allPollVotes.find((v) => v.pollId === pollRow.id && v.userId === viewer?.id);
          postPoll = {
            id: pollRow.id,
            question: pollRow.question,
            expiresAt: pollRow.expiresAt,
            options: opts,
            userVotedOptionId: userVote?.optionId || null,
          };
        }
        enriched.set(p.id, {
          ...p,
          user: usersById.get(p.userId),
          sharedProfile: p.sharedProfileId
            ? sharedProfileCardData(usersById.get(p.sharedProfileId), {
                viewerId: viewer?.id ?? null,
                isFollower: viewerFollowIds.has(p.sharedProfileId),
              })
            : null,
          group: { id: group.id, name: group.name },
          poll: postPoll,
          likes: allLikes.filter((l) => l.postId === p.id).map((l) => ({ ...l, user: usersById.get(l.userId) })),
          comments: allComments
            .filter((c) => c.postId === p.id)
            .map((c) => ({ ...c, user: usersById.get(c.userId) }))
            .reverse(),
        });
      }
      groupPosts = rows.map((p) => {
        const base = enriched.get(p.id);
        if (p.repostOfId && enriched.has(p.repostOfId)) {
          return { ...base, repostOf: enriched.get(p.repostOfId) };
        }
        return base;
      });
    } catch (err) {
      console.warn('[group detail] DB query failed:', (err as Error)?.message);
      if (!group) {
        group = { id: groupId, name: 'Demo Group', description: 'Database is offline — showing placeholder data. Configure DATABASE_URL in .env.local to see real groups.', coverPhoto: null, adminId: 0 };
        members = [];
      }
    }
  } else {
    group = { id: groupId, name: 'Demo Group', description: 'Database is offline — showing placeholder data. Configure DATABASE_URL in .env.local to see real groups.', coverPhoto: null, adminId: 0 };
    members = [];
  }

  // Pending invites addressed to the viewer — surfaced above the group header
  // so an invited person can join in one click.
  const myInvites = viewer && hasDatabase ? await getMyGroupInvites() : [];
  const inviteForThisGroup = myInvites.filter((i: any) => i.group?.id === groupId);

  const isMember = !!viewer && members.some((m: any) => m.user?.id === viewer.id);
  const isAdmin = !!viewer && group?.adminId === viewer.id;
  const memberRole = members.find((m: any) => m.user?.id === viewer?.id)?.role || 'member';
  const isPrivate = (group?.privacy || 'public') === 'private';
  const requiresApproval = isPrivate || group?.requireApproval === 1;
  const canSeeFeed = !isPrivate || isMember || isAdmin;

  let joinRequests: { user: any; status?: string }[] = [];
  let joinPending = false;
  let events: any[] = [];
  if (hasDatabase && viewer) {
    try {
      if (isAdmin) {
        const rows = await prisma.groupJoinRequest.findMany({
          where: { groupId, status: 'pending' },
          include: { user: true },
        });
        joinRequests = rows.map((r) => ({ user: r.user, status: r.status }));
      } else if (!isMember) {
        const mine = await prisma.groupJoinRequest.findFirst({
          where: { groupId, userId: viewer.id, status: 'pending' },
          select: { id: true },
        });
        joinPending = !!mine;
      }
      if (canSeeFeed) {
        const eventRows = await prisma.groupEvent.findMany({
          // This dynamic server route intentionally computes a request-time cutoff.
          // eslint-disable-next-line react-hooks/purity
          where: { groupId, startsAt: { gte: new Date(Date.now() - 86400000) } },
          include: { rsvps: true },
          orderBy: { startsAt: 'asc' },
          take: 8,
        });
        events = eventRows.map((ev) => ({
          id: ev.id,
          title: ev.title,
          description: ev.description,
          location: ev.location,
          startsAt: ev.startsAt,
          going: ev.rsvps.filter((r) => r.status === 'going').length,
          maybe: ev.rsvps.filter((r) => r.status === 'maybe').length,
          myStatus: ev.rsvps.find((r) => r.userId === viewer?.id)?.status || null,
        }));
      }
    } catch (err) {
      console.warn('[group detail] join requests query failed:', (err as Error)?.message);
    }
  }

  const visibleMembers = members.filter((m: any) => m.user);

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-4 md:mt-6 pb-24 md:pb-8">
      <Link href="/groups" className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline mb-3 text-sm font-semibold">
        <ArrowLeft className="w-4 h-4" /> Back to Groups
      </Link>

      {inviteForThisGroup.length > 0 && (
        <GroupInviteInbox invites={inviteForThisGroup as any} compact />
      )}

      {/* Group header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 overflow-hidden mb-4 md:mb-6">
        <div className="h-28 sm:h-40 md:h-56 relative">
          {group.coverPhoto ? (
            <img src={group.coverPhoto} className="w-full h-full object-cover" alt={group.name} />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-blue-500 to-indigo-600" />
          )}
        </div>
        <div className="p-3 sm:p-4 md:p-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white truncate">{group.name}</h1>
            {group.description && (
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm line-clamp-2 md:line-clamp-none">{group.description}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap">
              <a href="#group-members" className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                <Users className="w-3.5 h-3.5" /> {members.length} member{members.length !== 1 ? 's' : ''}
              </a>
              <span className="flex items-center gap-1">
                <Lock className="w-3.5 h-3.5" /> {isPrivate ? 'Private group' : 'Public group'}
              </span>
              {group.category && (
                <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold">
                  {group.category}
                </span>
              )}
              {group.createdAt && (
                <span className="hidden sm:flex items-center gap-1">
                  <CalendarDays className="w-3.5 h-3.5" /> Created {new Date(group.createdAt).toLocaleDateString()}
                </span>
              )}
            </p>

            {visibleMembers.length > 0 && (
              <a href="#group-members" className="mt-2.5 flex items-center gap-2 min-w-0">
                <span className="flex -space-x-2">
                  {visibleMembers.slice(0, 7).map(({ user: u }: any) =>
                    u.avatar ? (
                      <img
                        key={u.id}
                        src={u.avatar}
                        alt={u.name || 'Member'}
                        className="w-7 h-7 rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
                      />
                    ) : (
                      <span
                        key={u.id}
                        className="w-7 h-7 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-800"
                      >
                        {(u.name || 'U').charAt(0)}
                      </span>
                    ),
                  )}
                </span>
                {visibleMembers.length > 7 && (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
                    +{visibleMembers.length - 7} more
                  </span>
                )}
              </a>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
            {viewer ? (
              <>
                {(isMember || isAdmin) && (
                  <StartCallButton groupId={groupId} groupName={group.name} viewer={viewer} />
                )}
                {(isMember || isAdmin) && (
                  <GroupInviteButton
                    groupId={groupId}
                    groupName={group.name}
                    canManage={isAdmin || memberRole === 'admin' || memberRole === 'moderator'}
                  />
                )}
                <GroupMembershipButton
                  groupId={groupId}
                  isMember={isMember}
                  isAdmin={isAdmin}
                  joinPending={joinPending}
                  requiresApproval={requiresApproval}
                />
                {isAdmin && (
                  <GroupAdminControls
                    group={group}
                    members={members}
                    joinRequests={joinRequests}
                  />
                )}
              </>
            ) : (
              <Link
                href="/login"
                className="col-span-2 text-center text-blue-600 dark:text-blue-400 text-sm font-semibold hover:underline py-2"
              >
                Sign in to join
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Discussion feed — after info on phones so details stay above the fold */}
        <div className={`md:col-span-2 space-y-4 ${!canSeeFeed ? 'order-2 md:order-1' : 'order-1 md:order-1'}`}>

          {!canSeeFeed ? (
            <div className="bg-blue-50/70 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-2xl p-4 text-sm text-blue-800 dark:text-blue-200">
              <b>This is a private group.</b> Request to join to see posts and take part in the discussion.
            </div>
          ) : isMember ? (
            <CreatePost user={viewer} groupId={groupId} />
          ) : (
            <div className="bg-blue-50/70 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-2xl p-4 text-sm text-blue-800 dark:text-blue-200">
              <b>Join {group.name}</b> to post in this community and share with its members.
            </div>
          )}

          {!canSeeFeed ? (
            <EmptyState variant="chat" title="Members only">
              Posts in this community are hidden until you are approved.
            </EmptyState>
          ) : groupPosts.length === 0 ? (
            <EmptyState variant="chat" title="No posts yet">
              {isMember
                ? 'Be the first to start the discussion in this community.'
                : 'Join the group to kick off the first discussion.'}
            </EmptyState>
          ) : (
            groupPosts.map((post: any) => (
              <Post
                key={post.id}
                post={post}
                currentUser={currentUser}
                isBookmarked={bookmarkedIds.has(post.id)}
                viewerFollowIds={Array.from(viewerFollowIds)}
              />
            ))
          )}
        </div>

        {/* Sidebar: About + Members */}
        <div id="group-members" className={`space-y-4 md:space-y-6 ${!canSeeFeed ? 'order-1 md:order-2' : 'order-2 md:order-2'}`}>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 p-5">
            <h2 className="font-bold text-base mb-2 text-gray-900 dark:text-white">About this Group</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {group.description || 'A community for shared interests and discussions.'}
            </p>
            {(group.location || group.website || group.category) && (
              <div className="mt-3 space-y-1 text-xs text-gray-500 dark:text-gray-400">
                {group.category && <div>Category · {group.category}</div>}
                {group.location && <div>Based in {group.location}</div>}
                {group.website && (
                  <a href={group.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">
                    {String(group.website).replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>
            )}
            {group.rules && (
              <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Rules</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{group.rules}</p>
              </div>
            )}
          </div>

          {canSeeFeed && (
            <GroupEvents
              groupId={groupId}
              events={events}
              canCreate={isAdmin || members.some((m) => m.user?.id === viewer?.id && (m.role === 'admin' || m.role === 'moderator'))}
            />
          )}

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/60 p-5">
            <h3 className="font-bold text-base mb-3 flex items-center gap-2 text-gray-900 dark:text-white">
              <Users className="text-blue-500 w-5 h-5" /> Members · {members.length}
            </h3>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {members.map(({ user: u, role }) => u && (
                <Link key={u.id} href={`/profile/${u.id}`} className="flex items-center space-x-3 hover:bg-gray-50 dark:hover:bg-gray-700/60 rounded-lg p-1.5 transition-colors">
                  {u.avatar ? (
                    <img src={u.avatar} alt={u.name || 'User'} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0">
                      {(u.name || 'G').charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate text-gray-900 dark:text-white">{u.name || 'User'}</div>
                    {u.id === group?.adminId ? (
                      <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                        <Crown className="w-3 h-3 shrink-0" /> Admin
                      </div>
                    ) : role === 'moderator' ? (
                      <div className="text-xs text-blue-600 dark:text-blue-400">Moderator</div>
                    ) : role === 'admin' ? (
                      <div className="text-xs text-yellow-600 dark:text-yellow-400">Admin</div>
                    ) : null}
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
