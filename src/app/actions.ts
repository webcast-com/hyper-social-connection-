'use server';

import { db } from '@/db';
import { posts, comments, likes, follows, messages, users, notifications, stories, groups, groupMembers, bookmarks, reports, polls, pollOptions, pollVotes } from '@/db/schema';
import { eq, and, desc, ilike } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getViewer } from '@/lib/viewer';

async function getUserId() {
  const viewer = await getViewer();
  return viewer?.id || 1;
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
  const hasPoll = formData.get('hasPoll') === 'true';

  if (!content && !imageUrl && !videoUrl && !hasPoll) throw new Error('Content or media is required');

  try {
    const postRes = await db.insert(posts).values({
      userId,
      content,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
    }).returning();

    const createdPost = postRes[0];

    if (hasPoll && createdPost) {
      const option1 = ((formData.get('pollOption1') as string) || '').trim();
      const option2 = ((formData.get('pollOption2') as string) || '').trim();
      const option3 = ((formData.get('pollOption3') as string) || '').trim();
      const option4 = ((formData.get('pollOption4') as string) || '').trim();
      const durationDays = Number(formData.get('pollDurationDays') || 1);
      const expiresAt = new Date(Date.now() + durationDays * 86400000);

      const options = [option1, option2, option3, option4].filter(Boolean);
      if (options.length >= 2) {
        const pollRes = await db.insert(polls).values({
          postId: createdPost.id,
          question: content || 'Community Poll',
          expiresAt,
        }).returning();

        const createdPoll = pollRes[0];
        if (createdPoll) {
          for (let i = 0; i < options.length; i++) {
            await db.insert(pollOptions).values({
              pollId: createdPoll.id,
              text: options[i],
              position: i,
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
    const results = await db.select().from(users).where(
      and(
        ilike(users.name, `%${clean}%`)
      )
    );
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
    const results = await db.select({ post: posts, user: users }).from(posts).leftJoin(users, eq(posts.userId, users.id)).where(
      ilike(posts.content, `%${clean}%`)
    ).orderBy(desc(posts.createdAt));
    if (results.length > 0) return results;
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

export async function toggleBookmark(postId: number) {
  const userId = await getUserId();
  if (!userId) return false;
  try {
    const existing = await db.select().from(bookmarks).where(
      and(eq(bookmarks.userId, userId), eq(bookmarks.postId, postId))
    );
    if (existing.length > 0) {
      await db.delete(bookmarks).where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.postId, postId))
      );
      revalidatePath('/');
      revalidatePath(`/profile/${userId}`);
      return false;
    } else {
      await db.insert(bookmarks).values({ userId, postId });
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
    await db.delete(posts).where(
      and(eq(posts.id, postId), eq(posts.userId, userId))
    );
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
    await db.delete(comments).where(
      and(eq(comments.id, commentId), eq(comments.userId, userId))
    );
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
    const newPost = await db.insert(posts).values({
      userId,
      content,
      repostOfId: postId,
      privacy: 'public',
    }).returning();

    // Notify author of original post
    const originalPost = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    if (originalPost.length > 0 && originalPost[0].userId !== userId) {
      await createNotification(originalPost[0].userId, userId, 'repost', newPost[0]?.id || postId);
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
    await db.insert(reports).values({
      reporterId: userId,
      postId,
      reason: reason || 'other',
      details: details || null,
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
    const existing = await db.select().from(pollVotes).where(
      and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, userId))
    );

    if (existing.length > 0) {
      await db.update(pollVotes).set({ optionId }).where(
        and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, userId))
      );
    } else {
      await db.insert(pollVotes).values({
        pollId,
        optionId,
        userId,
      });
    }
  } catch (e) {
    console.warn('[action:votePoll] DB unavailable:', (e as Error)?.message);
  }

  revalidatePath('/');
  return { success: true };
}


