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
  try {
    await db.insert(notifications).values({
      userId,
      actorId,
      type,
      postId: postId || null,
      messageId: messageId || null,
      isRead: 0,
    }).onConflictDoNothing();
  } catch (e) {
    console.warn('[action:createNotification] DB unavailable:', (e as Error)?.message);
  }
}

export async function createPost(formData: FormData) {
  const userId = await getUserId();
  const content = ((formData.get('content') as string) || '').trim();
  const imageUrl = formData.get('imageUrl') as string | null;
  const videoUrl = formData.get('videoUrl') as string | null;

  if (!content && !imageUrl && !videoUrl) throw new Error('Content or media is required');

  try {
    await db.insert(posts).values({
      userId,
      content,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
    });
  } catch (e) {
    console.warn('[action:createPost] DB unavailable, skipping insert:', (e as Error)?.message);
  }

  revalidatePath('/');
  revalidatePath('/discover');
}

export async function toggleLike(postId: number) {
  const userId = await getUserId();
  try {
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
  } catch (e) {
    console.warn('[action:toggleLike] DB unavailable:', (e as Error)?.message);
  }
  
  revalidatePath('/');
  revalidatePath('/notifications');
}

export async function createComment(postId: number, formData: FormData) {
  const userId = await getUserId();
  const content = formData.get('content') as string;
  
  if (!content) return;
  
  try {
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
  } catch (e) {
    console.warn('[action:createComment] DB unavailable:', (e as Error)?.message);
  }
  
  revalidatePath('/');
  revalidatePath('/notifications');
}

export async function toggleFollow(followingId: number) {
  const followerId = await getUserId();
  if (followerId === followingId) return;

  try {
    const existingFollow = await db.select().from(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    
    if (existingFollow.length > 0) {
      await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    } else {
      await db.insert(follows).values({ followerId, followingId });
      await createNotification(followingId, followerId, 'follow');
    }
  } catch (e) {
    console.warn('[action:toggleFollow] DB unavailable:', (e as Error)?.message);
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

  try {
    await db.update(users).set({
      name,
      bio,
      avatar,
      coverPhoto,
    }).where(eq(users.id, userId));
  } catch (e) {
    console.warn('[action:updateProfile] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/settings');
  revalidatePath(`/profile/${userId}`);
}

export async function updateAvatar(avatarUrl: string) {
  const userId = await getUserId();
  if (!avatarUrl) return;

  try {
    await db.update(users).set({ avatar: avatarUrl }).where(eq(users.id, userId));
  } catch (e) {
    console.warn('[action:updateAvatar] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/');
  revalidatePath('/settings');
  revalidatePath(`/profile/${userId}`);
}

export async function updateCoverPhoto(coverUrl: string) {
  const userId = await getUserId();
  // Empty string clears the cover photo (falls back to the gradient).
  const coverPhoto = coverUrl?.trim() || null;

  try {
    await db.update(users).set({ coverPhoto }).where(eq(users.id, userId));
  } catch (e) {
    console.warn('[action:updateCoverPhoto] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/settings');
  revalidatePath(`/profile/${userId}`);
}

export async function sendMessage(receiverId: number, formData: FormData) {
  const senderId = await getUserId();
  const content = formData.get('content') as string;
  
  if (!content) return;
  
  try {
    const result = await db.insert(messages).values({
      senderId,
      receiverId,
      content,
    }).returning();
    
    await createNotification(receiverId, senderId, 'message', undefined, result[0].id);
  } catch (e) {
    console.warn('[action:sendMessage] DB unavailable:', (e as Error)?.message);
  }
  
  revalidatePath('/messages');
  revalidatePath(`/messages/${receiverId}`);
  revalidatePath('/notifications');
}

export async function searchUsers(query: string) {
  try {
    const userId = await getUserId();
    if (!query) return [];
    const results = await db.select().from(users).where(
      and(
        ilike(users.name, `%${query}%`)
      )
    );
    return results.filter(u => u.id !== userId);
  } catch (e) {
    console.warn('[action:searchUsers] DB unavailable:', (e as Error)?.message);
    return [];
  }
}

export async function searchPosts(query: string) {
  try {
    if (!query) return [];
    const results = await db.select({ post: posts, user: users }).from(posts).leftJoin(users, eq(posts.userId, users.id)).where(
      ilike(posts.content, `%${query}%`)
    ).orderBy(desc(posts.createdAt));
    return results;
  } catch (e) {
    console.warn('[action:searchPosts] DB unavailable:', (e as Error)?.message);
    return [];
  }
}

export async function markNotificationRead(id: number) {
  try {
    const userId = await getUserId();
    await db.update(notifications).set({ isRead: 1 }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  } catch (e) {
    console.warn('[action:markNotificationRead] DB unavailable:', (e as Error)?.message);
  }
  revalidatePath('/notifications');
}

export async function createStory(imageUrl: string) {
  const userId = await getUserId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  try {
    await db.insert(stories).values({
      userId,
      imageUrl,
      expiresAt,
    });
  } catch (e) {
    console.warn('[action:createStory] DB unavailable:', (e as Error)?.message);
  }
  revalidatePath('/');
}

export async function createGroup(formData: FormData) {
  const userId = await getUserId();
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  
  try {
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
  } catch (e) {
    console.warn('[action:createGroup] DB unavailable:', (e as Error)?.message);
    revalidatePath('/groups');
    return { id: Date.now(), name, description, adminId: userId } as any;
  }
}

export async function joinGroup(groupId: number) {
  const userId = await getUserId();
  try {
    await db.insert(groupMembers).values({
      groupId,
      userId,
    }).onConflictDoNothing();
  } catch (e) {
    console.warn('[action:joinGroup] DB unavailable:', (e as Error)?.message);
  }
  revalidatePath(`/groups/${groupId}`);
}

export async function getNotifications() {
  try {
    const userId = await getUserId();
    const { hasDatabase } = await import('@/db');
    if (!hasDatabase) return [];
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
  } catch (e) {
    console.warn('[action:getNotifications] DB unavailable:', (e as Error)?.message);
    return [];
  }
}
