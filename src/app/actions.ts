'use server';

import { db } from '@/db';
import { posts, comments, likes, follows, messages, users, notifications, stories, groups, groupMembers } from '@/db/schema';
import { eq, and, desc, ilike } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/viewer';

async function getUserId() {
  const viewer = await getViewer();
  return viewer.id;
}

async function createNotification(userId: number, actorId: number, type: string, postId?: number, messageId?: number) {
  // Don't notify yourself
  if (userId === actorId) return;
  await db.insert(notifications).values({
    userId,
    actorId,
    type,
    postId: postId || null,
    messageId: messageId || null,
    isRead: 0,
  }).onConflictDoNothing();
}

export async function createPost(formData: FormData) {
  const userId = await getUserId();
  const content = ((formData.get('content') as string) || '').trim();
  const imageUrl = formData.get('imageUrl') as string | null;
  const videoUrl = formData.get('videoUrl') as string | null;

  if (!content && !imageUrl && !videoUrl) throw new Error('Content or media is required');

  await db.insert(posts).values({
    userId,
    content,
    imageUrl: imageUrl || null,
    videoUrl: videoUrl || null,
  });

  revalidatePath('/');
  revalidatePath('/discover');
}

export async function toggleLike(postId: number) {
  const userId = await getUserId();
  
  const existingLike = await db.select().from(likes).where(and(eq(likes.postId, postId), eq(likes.userId, userId)));
  
  if (existingLike.length > 0) {
    await db.delete(likes).where(and(eq(likes.postId, postId), eq(likes.userId, userId)));
  } else {
    await db.insert(likes).values({ postId, userId });
    // Notify post owner
    const postRes = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    if (postRes.length > 0) {
      await createNotification(postRes[0].userId, userId, 'like', postId);
    }
  }
  
  revalidatePath('/');
  revalidatePath('/notifications');
}

export async function createComment(postId: number, formData: FormData) {
  const userId = await getUserId();
  const content = formData.get('content') as string;
  
  if (!content) return;
  
  await db.insert(comments).values({
    postId,
    userId,
    content,
  });
  
  // Notify post owner
  const postRes = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
  if (postRes.length > 0) {
    await createNotification(postRes[0].userId, userId, 'comment', postId);
  }
  
  revalidatePath('/');
  revalidatePath('/notifications');
}

export async function toggleFollow(followingId: number) {
  const followerId = await getUserId();
  if (followerId === followingId) return;

  const existingFollow = await db.select().from(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
  
  if (existingFollow.length > 0) {
    await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
  } else {
    await db.insert(follows).values({ followerId, followingId });
    await createNotification(followingId, followerId, 'follow');
  }
  
  revalidatePath(`/profile/${followingId}`);
  revalidatePath('/discover');
  revalidatePath('/notifications');
}

export async function updateProfile(formData: FormData) {
  const userId = await getUserId();
  const name = formData.get('name') as string;
  const bio = formData.get('bio') as string;
  const avatar = formData.get('avatar') as string;
  const coverPhoto = formData.get('coverPhoto') as string;

  await db.update(users).set({
    name,
    bio,
    avatar,
    coverPhoto,
  }).where(eq(users.id, userId));

  revalidatePath('/settings');
  revalidatePath(`/profile/${userId}`);
}

export async function updateAvatar(avatarUrl: string) {
  const userId = await getUserId();
  if (!avatarUrl) return;

  await db.update(users).set({ avatar: avatarUrl }).where(eq(users.id, userId));

  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath(`/profile/${userId}`);
}

export async function sendMessage(receiverId: number, formData: FormData) {
  const senderId = await getUserId();
  const content = formData.get('content') as string;
  
  if (!content) return;
  
  const result = await db.insert(messages).values({
    senderId,
    receiverId,
    content,
  }).returning();
  
  await createNotification(receiverId, senderId, 'message', undefined, result[0].id);
  
  revalidatePath('/messages');
  revalidatePath(`/messages/${receiverId}`);
  revalidatePath('/notifications');
}

export async function searchUsers(query: string) {
  const userId = await getUserId();
  if (!query) return [];
  const results = await db.select().from(users).where(
    and(
      ilike(users.name, `%${query}%`)
    )
  );
  return results.filter(u => u.id !== userId);
}

export async function searchPosts(query: string) {
  if (!query) return [];
  const results = await db.select({ post: posts, user: users }).from(posts).leftJoin(users, eq(posts.userId, users.id)).where(
    ilike(posts.content, `%${query}%`)
  ).orderBy(desc(posts.createdAt));
  return results;
}

export async function markNotificationRead(id: number) {
  const userId = await getUserId();
  await db.update(notifications).set({ isRead: 1 }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  revalidatePath('/notifications');
}

export async function createStory(imageUrl: string) {
  const userId = await getUserId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await db.insert(stories).values({
    userId,
    imageUrl,
    expiresAt,
  });
  revalidatePath('/');
}

export async function createGroup(formData: FormData) {
  const userId = await getUserId();
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  
  const res = await db.insert(groups).values({
    name,
    description,
    adminId: userId,
  }).returning();
  
  await db.insert(groupMembers).values({
    groupId: res[0].id,
    userId,
  });
  
  revalidatePath('/groups');
  return res[0];
}

export async function joinGroup(groupId: number) {
  const userId = await getUserId();
  await db.insert(groupMembers).values({
    groupId,
    userId,
  }).onConflictDoNothing();
  revalidatePath(`/groups/${groupId}`);
}

export async function getNotifications() {
  const userId = await getUserId();
  const result = await db.select({
    notification: notifications,
    actor: users,
    post: posts,
    message: messages,
  }).from(notifications)
  .leftJoin(users, eq(notifications.actorId, users.id))
  .leftJoin(posts, eq(notifications.postId, posts.id))
  .leftJoin(messages, eq(notifications.messageId, messages.id))
  .where(eq(notifications.userId, userId))
  .orderBy(desc(notifications.createdAt));
  
  return result;
}
