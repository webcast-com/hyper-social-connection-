'use server';

import { prisma, hasDatabase } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/viewer';
import { isSafeMediaUrl } from '@/lib/media-url';
import bcrypt from 'bcryptjs';
import {
  GROUP_CATEGORIES,
  GROUP_PRIVACY,
  GROUP_ROLES,
  MESSAGE_PRIVACY,
  PROFILE_VISIBILITY,
  sanitizeUsername,
  sanitizeWebsite,
  trimField,
} from '@/lib/profile';

async function getUserId(): Promise<number | null> {
  const viewer = await getViewer();
  return viewer?.id || null;
}

async function createNotification(userId: number, actorId: number, type: string, postId?: number, messageId?: number) {
  // Don't notify yourself
  if (userId === actorId) return;
  try {
    const prefs = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifyLikes: true,
        notifyComments: true,
        notifyFollows: true,
        notifyMessages: true,
      },
    });
    if (prefs) {
      if (type === 'like' && prefs.notifyLikes === 0) return;
      if (type === 'comment' && prefs.notifyComments === 0) return;
      if (type === 'follow' && prefs.notifyFollows === 0) return;
      if (type === 'message' && prefs.notifyMessages === 0) return;
    }

    await prisma.notification.create({
      data: {
        userId,
        actorId,
        type,
        postId: postId || null,
        messageId: messageId || null,
        isRead: 0,
      },
    });
  } catch (e) {
    console.warn('[action:createNotification] DB unavailable:', (e as Error)?.message);
  }
}

export async function createPost(formData: FormData) {
  const userId = await getUserId();
  if (!userId) return;
  const content = ((formData.get('content') as string) || '').trim();
  const imageUrlRaw = formData.get('imageUrl') as string | null;
  const videoUrlRaw = formData.get('videoUrl') as string | null;
  const imageUrl = isSafeMediaUrl(imageUrlRaw) ? imageUrlRaw.trim() : null;
  const videoUrl = isSafeMediaUrl(videoUrlRaw) ? videoUrlRaw.trim() : null;
  const hasPoll = formData.get('hasPoll') === 'true';
  const requestedGroupId = Number(formData.get('groupId') || 0);
  const scheduledRaw = String(formData.get('scheduledAt') || '').trim();
  let scheduledAt: Date | null = null;
  if (scheduledRaw) {
    const parsed = new Date(scheduledRaw);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now() + 30_000) {
      scheduledAt = parsed;
    }
  }

  if (!content && !imageUrl && !videoUrl && !hasPoll) throw new Error('Content or media is required');

  try {
    // Group posts are members-only — verified server-side, not just in the UI.
    let groupId: number | null = null;
    if (requestedGroupId > 0) {
      const membership = await prisma.groupMember.findFirst({
        where: { groupId: requestedGroupId, userId },
        select: { userId: true },
      });
      if (!membership) {
        console.warn('[action:createPost] non-member tried to post in group', requestedGroupId);
        return; // silently refuse — the composer is only rendered for members anyway
      }
      groupId = requestedGroupId;
    }

    const createdPost = await prisma.post.create({
      data: {
        userId,
        content,
        imageUrl: imageUrl || null,
        videoUrl: videoUrl || null,
        groupId,
        scheduledAt,
      },
    });

    if (hasPoll && createdPost) {
      const option1 = ((formData.get('pollOption1') as string) || '').trim();
      const option2 = ((formData.get('pollOption2') as string) || '').trim();
      const option3 = ((formData.get('pollOption3') as string) || '').trim();
      const option4 = ((formData.get('pollOption4') as string) || '').trim();
      const durationDays = Number(formData.get('pollDurationDays') || 1);
      const expiresAt = new Date(Date.now() + durationDays * 86400000);

      const options = [option1, option2, option3, option4].filter(Boolean);
      if (options.length >= 2) {
        const createdPoll = await prisma.poll.create({
          data: {
            postId: createdPost.id,
            question: content || 'Community Poll',
            expiresAt,
          },
        });

        if (createdPoll) {
          for (let i = 0; i < options.length; i++) {
            await prisma.pollOption.create({
              data: {
                pollId: createdPoll.id,
                text: options[i],
                position: i,
              },
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn('[action:createPost] DB unavailable, skipping insert:', (e as Error)?.message);
  }

  revalidatePath('/');
  revalidatePath('/discover');
  if (requestedGroupId > 0) revalidatePath(`/groups/${requestedGroupId}`);
}

export async function toggleLike(postId: number) {
  const userId = await getUserId();
  if (!userId) return;
  try {
    const existingLike = await prisma.like.findFirst({
      where: { postId, userId },
    });

    if (existingLike) {
      await prisma.like.deleteMany({ where: { postId, userId } });
    } else {
      // The database enforces UNIQUE(post_id, user_id), so a double submit or
      // a concurrent request that slips between the check above and this
      // insert is rejected (skipDuplicates) rather than stored twice. Only
      // notify when this request actually created the like, so a duplicate
      // click cannot spam the post owner.
      const inserted = await prisma.like.createMany({
        data: { postId, userId },
        skipDuplicates: true,
      });

      if (inserted.count > 0) {
        const post = await prisma.post.findFirst({
          where: { id: postId },
          select: { userId: true },
        });
        if (post) {
          await createNotification(post.userId, userId, 'like', postId);
        }
      }
    }
  } catch (e) {
    console.warn('[action:toggleLike] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/');
  revalidatePath('/notifications');
}

export async function createComment(postId: number, formData: FormData) {
  const userId = await getUserId();
  if (!userId) return;
  const content = formData.get('content') as string;

  if (!content) return;

  try {
    await prisma.comment.create({
      data: {
        postId,
        userId,
        content,
      },
    });

    // Notify post owner
    const post = await prisma.post.findFirst({
      where: { id: postId },
      select: { userId: true },
    });
    if (post) {
      await createNotification(post.userId, userId, 'comment', postId);
    }
  } catch (e) {
    console.warn('[action:createComment] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/');
  revalidatePath('/notifications');
}

export async function toggleFollow(followingId: number) {
  const followerId = await getUserId();
  if (!followerId) return { status: 'error' as const };
  if (followerId === followingId) return { status: 'error' as const };

  try {
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: followerId, blockedId: followingId },
          { blockerId: followingId, blockedId: followerId },
        ],
      },
    });
    if (blocked) return { status: 'blocked' as const };

    const existingFollow = await prisma.follow.findFirst({
      where: { followerId, followingId },
    });

    if (existingFollow) {
      await prisma.follow.deleteMany({ where: { followerId, followingId } });
      await prisma.followRequest.deleteMany({ where: { followerId, followingId } });
      revalidatePath(`/profile/${followingId}`);
      revalidatePath('/discover');
      revalidatePath('/notifications');
      return { status: 'none' as const };
    }

    const pending = await prisma.followRequest.findFirst({
      where: { followerId, followingId, status: 'pending' },
    });
    if (pending) {
      await prisma.followRequest.deleteMany({ where: { followerId, followingId } });
      revalidatePath(`/profile/${followingId}`);
      return { status: 'none' as const };
    }

    const target = await prisma.user.findUnique({
      where: { id: followingId },
      select: { followPrivacy: true },
    });
    if ((target?.followPrivacy || 'everyone') === 'approval') {
      await prisma.followRequest.upsert({
        where: { followerId_followingId: { followerId, followingId } },
        update: { status: 'pending' },
        create: { followerId, followingId, status: 'pending' },
      });
      await createNotification(followingId, followerId, 'follow_request');
      revalidatePath(`/profile/${followingId}`);
      revalidatePath('/notifications');
      revalidatePath('/settings');
      return { status: 'requested' as const };
    }

    await prisma.follow.create({ data: { followerId, followingId } });
    await createNotification(followingId, followerId, 'follow');
  } catch (e) {
    console.warn('[action:toggleFollow] DB unavailable:', (e as Error)?.message);
    return { status: 'error' as const };
  }

  revalidatePath(`/profile/${followingId}`);
  revalidatePath('/discover');
  revalidatePath('/notifications');
  return { status: 'following' as const };
}

export async function updateProfile(formData: FormData) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };

  const name = ((formData.get('name') as string) || '').trim();
  if (!name) return { success: false, message: 'Name is required' };
  if (name.length > 80) return { success: false, message: 'Name is too long' };

  let username: string | null;
  let website: string | null;
  try {
    username = sanitizeUsername(formData.get('username') as string);
    website = sanitizeWebsite(formData.get('website') as string);
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }

  const profileVisibility = String(formData.get('profileVisibility') || 'public');
  const messagePrivacy = String(formData.get('messagePrivacy') || 'everyone');
  const followPrivacy = String(formData.get('followPrivacy') || 'everyone');
  if (!PROFILE_VISIBILITY.includes(profileVisibility as (typeof PROFILE_VISIBILITY)[number])) {
    return { success: false, message: 'Invalid profile visibility' };
  }
  if (!MESSAGE_PRIVACY.includes(messagePrivacy as (typeof MESSAGE_PRIVACY)[number])) {
    return { success: false, message: 'Invalid message privacy' };
  }
  if (followPrivacy !== 'everyone' && followPrivacy !== 'approval') {
    return { success: false, message: 'Invalid follow privacy' };
  }

  const avatarRaw = ((formData.get('avatar') as string) || '').trim();
  const coverRaw = ((formData.get('coverPhoto') as string) || '').trim();
  if (avatarRaw && !isSafeMediaUrl(avatarRaw)) {
    return { success: false, message: 'Invalid avatar URL' };
  }
  if (coverRaw && !isSafeMediaUrl(coverRaw)) {
    return { success: false, message: 'Invalid cover photo URL' };
  }

  const data = {
    name,
    bio: trimField(formData.get('bio') as string, 280),
    avatar: avatarRaw || null,
    coverPhoto: coverRaw || null,
    username,
    location: trimField(formData.get('location') as string, 80),
    website,
    pronouns: trimField(formData.get('pronouns') as string, 40),
    workplace: trimField(formData.get('workplace') as string, 80),
    education: trimField(formData.get('education') as string, 80),
    profileVisibility,
    messagePrivacy,
    followPrivacy,
    notifyLikes: formData.get('notifyLikes') === '1' ? 1 : 0,
    notifyComments: formData.get('notifyComments') === '1' ? 1 : 0,
    notifyFollows: formData.get('notifyFollows') === '1' ? 1 : 0,
    notifyMessages: formData.get('notifyMessages') === '1' ? 1 : 0,
  };

  try {
    if (username) {
      const taken = await prisma.user.findFirst({
        where: { username, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) return { success: false, message: 'That username is already taken.' };
    }

    await prisma.user.update({
      where: { id: userId },
      data,
    });
  } catch (e) {
    console.warn('[action:updateProfile] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Could not save profile' };
  }

  revalidatePath('/settings');
  revalidatePath(`/profile/${userId}`);
  return { success: true, message: 'Profile saved' };
}

export async function changePassword(formData: FormData) {
  const viewer = await getViewer();
  if (!viewer) return { success: false, message: 'Must be logged in' };

  const currentPassword = String(formData.get('currentPassword') || '');
  const newPassword = String(formData.get('newPassword') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');

  if (newPassword.length < 8) {
    return { success: false, message: 'New password must be at least 8 characters.' };
  }
  if (newPassword !== confirmPassword) {
    return { success: false, message: 'New passwords do not match.' };
  }

  try {
    const match = await bcrypt.compare(currentPassword, viewer.password);
    if (!match) return { success: false, message: 'Current password is incorrect.' };

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: viewer.id },
      data: { password: hashed },
    });
  } catch (e) {
    console.warn('[action:changePassword] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Could not update password' };
  }

  revalidatePath('/settings');
  return { success: true, message: 'Password updated' };
}

export async function updateAvatar(avatarUrl: string) {
  const userId = await getUserId();
  if (!userId) return;
  if (!isSafeMediaUrl(avatarUrl)) return;

  try {
    await prisma.user.update({ where: { id: userId }, data: { avatar: avatarUrl } });
  } catch (e) {
    console.warn('[action:updateAvatar] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath(`/profile/${userId}`);
}

export async function updateCoverPhoto(coverUrl: string) {
  const userId = await getUserId();
  if (!userId) return;
  // Empty string clears the cover photo (falls back to the gradient).
  const trimmed = coverUrl?.trim() || '';
  const coverPhoto = trimmed ? (isSafeMediaUrl(trimmed) ? trimmed : null) : null;

  try {
    await prisma.user.update({ where: { id: userId }, data: { coverPhoto } });
  } catch (e) {
    console.warn('[action:updateCoverPhoto] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/settings');
  revalidatePath(`/profile/${userId}`);
}

export async function sendMessage(receiverId: number, formData: FormData) {
  const senderId = await getUserId();
  if (!senderId) return;
  try {
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId },
        ],
      },
    });
    if (blocked) return;

    const target = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { messagePrivacy: true },
    });
    const privacy = target?.messagePrivacy || 'everyone';
    if (privacy === 'nobody') return;
    if (privacy === 'followers') {
      const connected = await prisma.follow.findFirst({
        where: {
          OR: [
            { followerId: senderId, followingId: receiverId },
            { followerId: receiverId, followingId: senderId },
          ],
        },
        select: { followerId: true },
      });
      if (!connected) return;
    }
  } catch (e) {
    console.warn('[action:sendMessage] privacy check failed:', (e as Error)?.message);
  }
  const content = ((formData.get('content') as string) || '').trim();
  const imageUrlRaw = (formData.get('imageUrl') as string) || '';
  const videoUrlRaw = (formData.get('videoUrl') as string) || '';
  const imageUrl = isSafeMediaUrl(imageUrlRaw) ? imageUrlRaw.trim() : null;
  const videoUrl = isSafeMediaUrl(videoUrlRaw) ? videoUrlRaw.trim() : null;

  if (!content && !imageUrl && !videoUrl) return;

  try {
    const result = await prisma.message.create({
      data: {
        senderId,
        receiverId,
        content,
        imageUrl,
        videoUrl,
      },
    });

    await createNotification(receiverId, senderId, 'message', undefined, result.id);
  } catch (e) {
    console.warn('[action:sendMessage] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/messages');
  revalidatePath(`/messages/${receiverId}`);
  revalidatePath('/notifications');
}

const DEMO_USERS_SEARCH = [
  { id: 1, name: 'Alex Rivera', email: 'alex@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex', bio: '📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler.' },
  { id: 2, name: 'Maya Patel', email: 'maya@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maya', bio: '🎨 Digital artist and UI designer.' },
  { id: 3, name: 'Jordan Kim', email: 'jordan@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', bio: '🏋️ Fitness coach and wellness advocate.' },
  { id: 4, name: 'Sophie Chen', email: 'sophie@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie', bio: '👩‍💻 Full-stack engineer & open-source builder.' },
  { id: 5, name: 'Marcus Lee', email: 'marcus@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus', bio: '🎸 Musician and content creator.' },
];

const DEMO_POSTS_SEARCH = [
  { id: 6, userId: 4, content: '📊 Community Poll: Which modern web stack are you building your side projects with this year? #WebDev #NextJS #TechTrends', createdAt: new Date(Date.now() - 1800000) },
  { id: 1, userId: 1, content: '🌄 Just got back from an incredible trip to the Swiss Alps! The morning fog clearing over the peaks was breathtaking. #SwissAlps #Travel #Photography', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', createdAt: new Date(Date.now() - 3600000) },
  { id: 2, userId: 2, content: '🎨 Just finished my latest digital concept painting — took 40+ hours in Procreate! #DigitalArt #Illustration #Design', imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80', createdAt: new Date(Date.now() - 7200000) },
  { id: 3, userId: 3, content: '💪 New PR today! Deadlifted 200kg for 3 clean reps. Consistency is everything! #FitnessGoals #Workout #Motivation', imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80', createdAt: new Date(Date.now() - 14400000) },
  { id: 4, userId: 4, content: '🚀 Shipped our major social feature sprint today! The feed is running silky smooth with tabs and real-time interaction. #NextJS #OpenSource', createdAt: new Date(Date.now() - 28800000) },
  { id: 5, userId: 5, content: '🎸 Dropped a new original acoustic track today! Recorded with vintage tube mics. #Acoustic #MusicProduction', imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80', createdAt: new Date(Date.now() - 43200000) },
];

export async function searchUsers(query: string) {
  const clean = (query || '').trim().toLowerCase();
  if (!clean) return [];

  try {
    const userId = await getUserId();
    const results = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: clean, mode: 'insensitive' } },
          { username: { contains: clean, mode: 'insensitive' } },
        ],
      },
    });
    if (results.length > 0) {
      return results.filter((u) => u.id !== userId);
    }
  } catch (e) {
    console.warn('[action:searchUsers] DB unavailable:', (e as Error)?.message);
  }

  // Fallback demo search
  return DEMO_USERS_SEARCH.filter((u) =>
    u.name.toLowerCase().includes(clean) || u.bio.toLowerCase().includes(clean)
  );
}

export async function searchPosts(query: string) {
  const clean = (query || '').trim().toLowerCase();
  if (!clean) return [];

  try {
    const results = await prisma.post.findMany({
      where: {
        content: { contains: clean, mode: 'insensitive' },
      },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
    if (results.length > 0) {
      return results.map((post) => ({ post, user: post.user }));
    }
  } catch (e) {
    console.warn('[action:searchPosts] DB unavailable:', (e as Error)?.message);
  }

  // Fallback demo post search
  return DEMO_POSTS_SEARCH
    .filter((p) => p.content.toLowerCase().includes(clean))
    .map((p) => ({
      post: p,
      user: DEMO_USERS_SEARCH.find((u) => u.id === p.userId) || DEMO_USERS_SEARCH[0],
    }));
}

export async function markNotificationRead(id: number) {
  const userId = await getUserId();
  if (!userId) return;
  try {
    await prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: 1 },
    });
  } catch (e) {
    console.warn('[action:markNotificationRead] DB unavailable:', (e as Error)?.message);
  }
  revalidatePath('/notifications');
  revalidatePath('/', 'layout');
}

export async function markAllNotificationsRead() {
  const userId = await getUserId();
  if (!userId) return 0;
  try {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: 0 },
      data: { isRead: 1 },
    });
    revalidatePath('/notifications');
    revalidatePath('/', 'layout');
    return result.count;
  } catch (e) {
    console.warn('[action:markAllNotificationsRead] DB unavailable:', (e as Error)?.message);
    return 0;
  }
}

export async function createStory(imageUrl: string) {
  const userId = await getUserId();
  if (!userId) return;
  if (!isSafeMediaUrl(imageUrl)) return;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  try {
    await prisma.story.create({
      data: {
        userId,
        imageUrl,
        expiresAt,
      },
    });
  } catch (e) {
    console.warn('[action:createStory] DB unavailable:', (e as Error)?.message);
  }
  revalidatePath('/');
}

export async function createGroup(formData: FormData) {
  const userId = await getUserId();
  if (!userId) return null;
  const name = (formData.get('name') as string || '').trim();
  const description = (formData.get('description') as string || '').trim();
  const coverPhotoRaw = (formData.get('coverPhoto') as string || '').trim();
  const coverPhoto = coverPhotoRaw && isSafeMediaUrl(coverPhotoRaw) ? coverPhotoRaw : '';
  const privacyRaw = String(formData.get('privacy') || 'public');
  const privacy = GROUP_PRIVACY.includes(privacyRaw as (typeof GROUP_PRIVACY)[number]) ? privacyRaw : 'public';
  const categoryRaw = (formData.get('category') as string || '').trim();
  const category = GROUP_CATEGORIES.includes(categoryRaw as (typeof GROUP_CATEGORIES)[number]) ? categoryRaw : null;

  if (!name) return null;

  try {
    const group = await prisma.group.create({
      data: {
        name,
        description,
        coverPhoto: coverPhoto || null,
        adminId: userId,
        privacy,
        category,
        requireApproval: formData.get('requireApproval') === '1' ? 1 : 0,
      },
    });

    await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId,
        role: 'admin',
      },
    });

    revalidatePath('/groups');
    revalidatePath(`/groups/${group.id}`);
    return group;
  } catch (e) {
    console.warn('[action:createGroup] DB unavailable:', (e as Error)?.message);
    revalidatePath('/groups');
    return { id: Date.now(), name, description, adminId: userId } as any;
  }
}

export async function joinGroup(groupId: number) {
  const userId = await getUserId();
  if (!userId) return { success: false, pending: false, message: 'Must be logged in' };
  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, adminId: true, privacy: true, requireApproval: true },
    });
    if (!group) return { success: false, pending: false, message: 'Group not found' };

    const needsApproval = group.privacy === 'private' || group.requireApproval === 1;
    if (needsApproval) {
      await prisma.groupJoinRequest.upsert({
        where: { groupId_userId: { groupId, userId } },
        update: { status: 'pending' },
        create: { groupId, userId, status: 'pending' },
      });
      await createNotification(group.adminId, userId, 'follow');
      revalidatePath(`/groups/${groupId}`);
      revalidatePath('/groups');
      return { success: true, pending: true, message: 'Request sent' };
    }

    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      update: {},
      create: { groupId, userId, role: 'member' },
    });
    await prisma.groupJoinRequest.deleteMany({ where: { groupId, userId } });
  } catch (e) {
    console.warn('[action:joinGroup] DB unavailable:', (e as Error)?.message);
    return { success: false, pending: false, message: 'Database unavailable' };
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
  return { success: true, pending: false };
}

export async function leaveGroup(groupId: number) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  try {
    // The admin cannot leave their own group — they must keep or delete it.
    const g = await prisma.group.findFirst({
      where: { id: groupId },
      select: { adminId: true },
    });
    if (g?.adminId === userId) {
      return { success: false, message: 'The group admin cannot leave their own group' };
    }
    await prisma.groupMember.deleteMany({
      where: { groupId, userId },
    });
  } catch (e) {
    console.warn('[action:leaveGroup] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
  return { success: true };
}

export async function updateGroup(groupId: number, formData: FormData) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  const name = (formData.get('name') as string || '').trim();
  const description = (formData.get('description') as string || '').trim();
  const coverPhotoRaw = (formData.get('coverPhoto') as string || '').trim();
  if (coverPhotoRaw && !isSafeMediaUrl(coverPhotoRaw)) {
    return { success: false, message: 'Invalid cover photo URL' };
  }
  const coverPhoto = coverPhotoRaw;
  const privacyRaw = String(formData.get('privacy') || 'public');
  const privacy = GROUP_PRIVACY.includes(privacyRaw as (typeof GROUP_PRIVACY)[number]) ? privacyRaw : 'public';
  const categoryRaw = (formData.get('category') as string || '').trim();
  const category = GROUP_CATEGORIES.includes(categoryRaw as (typeof GROUP_CATEGORIES)[number]) ? categoryRaw : null;
  let website: string | null = null;
  try {
    website = sanitizeWebsite(formData.get('website') as string);
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }

  if (!name) return { success: false, message: 'Group name is required' };

  try {
    // Admin-only — enforced in the WHERE clause.
    await prisma.group.updateMany({
      where: { id: groupId, adminId: userId },
      data: {
        name,
        description: description || null,
        coverPhoto: coverPhoto || null,
        privacy,
        category,
        rules: trimField(formData.get('rules') as string, 800),
        location: trimField(formData.get('location') as string, 80),
        website,
        requireApproval: formData.get('requireApproval') === '1' ? 1 : 0,
      },
    });
  } catch (e) {
    console.warn('[action:updateGroup] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath('/groups');
  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

async function requireGroupAdmin(groupId: number, userId: number) {
  return prisma.group.findFirst({
    where: { id: groupId, adminId: userId },
    select: { id: true, adminId: true },
  });
}

export async function inviteGroupMember(groupId: number, query: string) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  const needle = (query || '').trim().replace(/^@/, '').toLowerCase();
  if (!needle) return { success: false, message: 'Enter a username or email' };

  try {
    const admin = await requireGroupAdmin(groupId, userId);
    if (!admin) return { success: false, message: 'Only the group admin can invite people' };

    const target = await prisma.user.findFirst({
      where: {
        OR: [
          { email: needle },
          { username: needle },
        ],
      },
      select: { id: true, name: true },
    });
    if (!target) return { success: false, message: 'No user found with that username or email' };
    if (target.id === userId) return { success: false, message: 'You already admin this group' };

    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId: target.id } },
      update: {},
      create: { groupId, userId: target.id, role: 'member' },
    });
    await prisma.groupJoinRequest.deleteMany({ where: { groupId, userId: target.id } });
    await createNotification(target.id, userId, 'follow');
  } catch (e) {
    console.warn('[action:inviteGroupMember] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath(`/groups/${groupId}`);
  revalidatePath('/groups');
  return { success: true, message: 'Invite sent — they are now a member' };
}

export async function removeGroupMember(groupId: number, memberId: number) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });
    if (!group) return { success: false, message: 'Group not found' };
    if (memberId === group.adminId) {
      return { success: false, message: 'The group owner cannot be removed' };
    }

    const actor = await prisma.groupMember.findFirst({
      where: { groupId, userId },
      select: { role: true },
    });
    const canModerate = group.adminId === userId || actor?.role === 'admin' || actor?.role === 'moderator';
    if (!canModerate) return { success: false, message: 'You cannot remove members' };

    await prisma.groupMember.deleteMany({ where: { groupId, userId: memberId } });
  } catch (e) {
    console.warn('[action:removeGroupMember] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

export async function setGroupMemberRole(groupId: number, memberId: number, role: string) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  if (!GROUP_ROLES.includes(role as (typeof GROUP_ROLES)[number])) {
    return { success: false, message: 'Invalid role' };
  }

  try {
    const admin = await requireGroupAdmin(groupId, userId);
    if (!admin) return { success: false, message: 'Only the group admin can change roles' };
    if (memberId === admin.adminId) {
      return { success: false, message: 'The group owner stays an admin' };
    }

    await prisma.groupMember.updateMany({
      where: { groupId, userId: memberId },
      data: { role },
    });
  } catch (e) {
    console.warn('[action:setGroupMemberRole] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

export async function reviewJoinRequest(groupId: number, requestUserId: number, decision: 'approved' | 'declined') {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };

  try {
    const admin = await requireGroupAdmin(groupId, userId);
    if (!admin) return { success: false, message: 'Only the group admin can review requests' };

    if (decision === 'approved') {
      await prisma.groupMember.upsert({
        where: { groupId_userId: { groupId, userId: requestUserId } },
        update: {},
        create: { groupId, userId: requestUserId, role: 'member' },
      });
    }
    await prisma.groupJoinRequest.updateMany({
      where: { groupId, userId: requestUserId },
      data: { status: decision },
    });
  } catch (e) {
    console.warn('[action:reviewJoinRequest] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath(`/groups/${groupId}`);
  return { success: true };
}

export async function deleteGroup(groupId: number) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in' };
  try {
    // Admin-only. group_members rows cascade; member posts survive with
    // group_id set to NULL (become regular feed posts).
    await prisma.group.deleteMany({
      where: { id: groupId, adminId: userId },
    });
  } catch (e) {
    console.warn('[action:deleteGroup] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Database unavailable' };
  }
  revalidatePath('/groups');
  return { success: true };
}

export async function getNotifications() {
  const userId = await getUserId();
  if (!userId || !hasDatabase) return [];
  try {
    const result = await prisma.notification.findMany({
      where: { userId },
      include: { actor: true, post: true, message: true },
      orderBy: { createdAt: 'desc' },
    });

    return result.map((notification) => ({
      notification,
      actor: notification.actor,
      post: notification.post,
      message: notification.message,
    }));
  } catch (e) {
    console.warn('[action:getNotifications] DB unavailable:', (e as Error)?.message);
    return [];
  }
}

export async function toggleBookmark(postId: number) {
  const userId = await getUserId();
  if (!userId) return false;
  try {
    const existing = await prisma.bookmark.findFirst({
      where: { userId, postId },
    });
    if (existing) {
      await prisma.bookmark.deleteMany({ where: { userId, postId } });
      revalidatePath('/');
      revalidatePath(`/profile/${userId}`);
      return false;
    } else {
      await prisma.bookmark.create({ data: { userId, postId } });
      revalidatePath('/');
      revalidatePath(`/profile/${userId}`);
      return true;
    }
  } catch (e) {
    console.warn('[action:toggleBookmark] DB unavailable:', (e as Error)?.message);
    return false;
  }
}

export async function deletePost(postId: number) {
  const userId = await getUserId();
  if (!userId) return;
  try {
    // Only author can delete their post
    await prisma.post.deleteMany({
      where: { id: postId, userId },
    });
  } catch (e) {
    console.warn('[action:deletePost] DB unavailable:', (e as Error)?.message);
  }
  revalidatePath('/');
  revalidatePath('/discover');
  revalidatePath(`/profile/${userId}`);
}

export async function deleteComment(commentId: number) {
  const userId = await getUserId();
  if (!userId) return;
  try {
    await prisma.comment.deleteMany({
      where: { id: commentId, userId },
    });
  } catch (e) {
    console.warn('[action:deleteComment] DB unavailable:', (e as Error)?.message);
  }
  revalidatePath('/');
}

export async function repostPost(postId: number, quoteContent?: string) {
  const userId = await getUserId();
  if (!userId) return;
  try {
    const content = (quoteContent || '').trim() || '🔁 Reposted';
    const newPost = await prisma.post.create({
      data: {
        userId,
        content,
        repostOfId: postId,
        privacy: 'public',
      },
    });

    // Notify author of original post
    const originalPost = await prisma.post.findFirst({
      where: { id: postId },
      select: { userId: true },
    });
    if (originalPost && originalPost.userId !== userId) {
      await createNotification(originalPost.userId, userId, 'repost', newPost?.id || postId);
    }
  } catch (e) {
    console.warn('[action:repostPost] DB unavailable:', (e as Error)?.message);
  }
  revalidatePath('/');
  revalidatePath(`/profile/${userId}`);
  revalidatePath('/notifications');
}

export async function reportPost(postId: number, reason: string, details?: string) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in to report' };
  try {
    await prisma.report.create({
      data: {
        reporterId: userId,
        postId,
        reason: reason || 'other',
        details: details || null,
      },
    });
    return { success: true, message: 'Thank you. Our moderation team has received your report.' };
  } catch (e) {
    console.warn('[action:reportPost] DB unavailable:', (e as Error)?.message);
    return { success: true, message: 'Report submitted.' };
  }
}

export async function votePoll(pollId: number, optionId: number) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in to vote' };
  try {
    const existing = await prisma.pollVote.findFirst({
      where: { pollId, userId },
    });

    if (existing) {
      await prisma.pollVote.updateMany({
        where: { pollId, userId },
        data: { optionId },
      });
    } else {
      await prisma.pollVote.create({
        data: {
          pollId,
          optionId,
          userId,
        },
      });
    }
  } catch (e) {
    console.warn('[action:votePoll] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/');
  return { success: true };
}



export async function editPost(postId: number, content: string) {
  const userId = await getUserId();
  if (!userId) return { success: false, message: 'Must be logged in to edit' };

  const trimmed = String(content || '').trim();
  if (!trimmed) return { success: false, message: 'Post content cannot be empty' };
  if (trimmed.length > 2000) return { success: false, message: 'Post is too long (max 2000 characters)' };

  try {
    // Only the author may edit — enforced in the WHERE clause, mirroring deletePost.
    await prisma.post.updateMany({
      where: { id: postId, userId },
      data: { content: trimmed, updatedAt: new Date() },
    });
  } catch (e) {
    console.warn('[action:editPost] DB unavailable:', (e as Error)?.message);
    return { success: false, message: 'Database unavailable — edit not saved' };
  }

  revalidatePath('/');
  revalidatePath(`/post/${postId}`);
  revalidatePath(`/profile/${userId}`);
  return { success: true };
}
