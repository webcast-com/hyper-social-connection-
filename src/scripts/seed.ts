import { db } from '../db';
import {
  users, posts, comments, likes, follows, messages, notifications, stories, groups, groupMembers,
} from '../db/schema';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Seeding data...');

  // ── 1. USERS ─────────────────────────────────────────────────────────────────
  const password = await bcrypt.hash('changeme123', 10);

  const insertedUsers = await db.insert(users).values([
    {
      name: 'Alex Rivera',
      email: 'alex@example.com',
      password,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
      coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80',
      bio: '📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler.',
    },
    {
      name: 'Maya Patel',
      email: 'maya@example.com',
      password,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maya',
      coverPhoto: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=80',
      bio: '🎨 Digital artist and designer.',
    },
    {
      name: 'Jordan Kim',
      email: 'jordan@example.com',
      password,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan',
      coverPhoto: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80',
      bio: '🏋️ Fitness coach and wellness advocate.',
    },
    {
      name: 'Sophie Chen',
      email: 'sophie@example.com',
      password,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie',
      coverPhoto: 'https://images.unsplash.com/photo-1490750967868-88df5691cc11?w=1200&q=80',
      bio: '👩‍💻 Full-stack engineer.',
    },
    {
      name: 'Marcus Lee',
      email: 'marcus@example.com',
      password,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus',
      coverPhoto: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
      bio: '🎸 Musician and content creator.',
    },
  ]).returning();

  const [alex, maya, jordan, sophie, marcus] = insertedUsers;
  console.log(`✅ Created ${insertedUsers.length} users`);

  // ── 2. POSTS ─────────────────────────────────────────────────────────────────
              const insertedPosts = await db.insert(posts).values([
      { userId: alex.id,    content: '🌄 Just got back from an incredible trip to the Swiss Alps!', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', privacy: 'public' },
      { userId: alex.id,    content: '☕ Sunday mornings are for slow coffee and good vibes.', privacy: 'public' },
      { userId: maya.id,    content: '🎨 Just finished my latest digital painting — took 40+ hours!', imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80', privacy: 'public' },
      { userId: maya.id,    content: 'Had the most amazing day at the botanical gardens with my pup.', imageUrl: 'https://images.unsplash.com/photo-1586671267731-da2cf3ceeb80?w=800&q=80', privacy: 'public' },
      { userId: jordan.id,  content: '💪 New PR today! Deadlifted 200kg!', imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80', privacy: 'public' },
      { userId: jordan.id,  content: '🚴 50-mile morning ride done!', privacy: 'public' },
      { userId: sophie.id,  content: '🚀 Shipped a major feature after a 72-hour sprint.', privacy: 'public' },
      { userId: sophie.id,  content: '🎮 Gaming night was chaotic but the best time!', imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80', privacy: 'public' },
      { userId: marcus.id,  content: '🎸 Dropped a new original track today!', imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80', privacy: 'public' },
    ]).returning();

  console.log(`✅ Created ${insertedPosts.length} posts`);

  // ── 3. LIKES ─────────────────────────────────────────────────────────────────
  const likePairs = [
    // Alex's posts liked by many
    { postId: insertedPosts[0].id, userId: maya.id },
    { postId: insertedPosts[0].id, userId: jordan.id },
    { postId: insertedPosts[0].id, userId: sophie.id },
    { postId: insertedPosts[0].id, userId: marcus.id },
    { postId: insertedPosts[1].id, userId: maya.id },
    // Maya's posts
    { postId: insertedPosts[2].id, userId: alex.id },
    { postId: insertedPosts[2].id, userId: sophie.id },
    { postId: insertedPosts[2].id, userId: jordan.id },
    { postId: insertedPosts[3].id, userId: alex.id },
    // Jordan's posts
    { postId: insertedPosts[4].id, userId: alex.id },
    { postId: insertedPosts[4].id, userId: marcus.id },
    { postId: insertedPosts[4].id, userId: maya.id },
    { postId: insertedPosts[4].id, userId: sophie.id },
    // Sophie's posts
    { postId: insertedPosts[6].id, userId: alex.id },
    { postId: insertedPosts[6].id, userId: marcus.id },
    { postId: insertedPosts[6].id, userId: jordan.id },
    { postId: insertedPosts[7].id, userId: maya.id },
    // Marcus
    { postId: insertedPosts[8].id, userId: alex.id },
    { postId: insertedPosts[8].id, userId: maya.id },
  ];

  await db.insert(likes).values(likePairs);
  console.log(`✅ Created ${likePairs.length} likes`);

  // ── 4. COMMENTS ──────────────────────────────────────────────────────────────
          await db.insert(comments).values([
      { postId: insertedPosts[0].id, userId: maya.id,   content: 'Oh my gosh, this is STUNNING!' },
      { postId: insertedPosts[0].id, userId: jordan.id, content: 'I hiked that same trail last summer!' },
      { postId: insertedPosts[2].id, userId: alex.id,   content: 'This is INCREDIBLE, Maya!!' },
      { postId: insertedPosts[2].id, userId: sophie.id, content: 'HOW?! Absolute genius!' },
      { postId: insertedPosts[4].id, userId: alex.id,   content: 'BEAST MODE!' },
      { postId: insertedPosts[6].id, userId: alex.id,   content: 'You are a machine Sophie!!' },
      { postId: insertedPosts[8].id, userId: alex.id,   content: 'This track is an absolute BANGER!' },
    ]);
  console.log('✅ Created comments');

  // ── 5. FOLLOWS ───────────────────────────────────────────────────────────────
  const followPairs = [
    { followerId: alex.id, followingId: maya.id },
    { followerId: alex.id, followingId: jordan.id },
    { followerId: alex.id, followingId: sophie.id },
    { followerId: alex.id, followingId: marcus.id },
    { followerId: maya.id, followingId: alex.id },
    { followerId: maya.id, followingId: sophie.id },
    { followerId: jordan.id, followingId: alex.id },
    { followerId: jordan.id, followingId: marcus.id },
    { followerId: sophie.id, followingId: alex.id },
    { followerId: sophie.id, followingId: maya.id },
    { followerId: sophie.id, followingId: marcus.id },
    { followerId: marcus.id, followingId: alex.id },
  ];
  await db.insert(follows).values(followPairs);
  console.log(`✅ Created ${followPairs.length} follows`);

  // ── 6. MESSAGES ──────────────────────────────────────────────────────────────
          await db.insert(messages).values([
      { senderId: maya.id,   receiverId: alex.id,  content: 'Hey Alex! That Alps photo is stunning 😍' },
      { senderId: alex.id,   receiverId: maya.id,  content: 'Thanks Maya!!' },
      { senderId: jordan.id, receiverId: alex.id,  content: 'Bro your fitness posts are getting me back in the gym!' },
      { senderId: sophie.id, receiverId: alex.id,  content: 'Alex!! We need a dev for the new side project 👀' },
      { senderId: marcus.id, receiverId: alex.id,  content: 'This track is an absolute BANGER!' },
    ]);
  console.log('✅ Created messages');

  // ── 7. STORIES ───────────────────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(stories).values([
      { userId: alex.id,    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80', expiresAt },
      { userId: maya.id,    imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=400&q=80', expiresAt },
      { userId: jordan.id,  imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80', expiresAt },
      { userId: sophie.id,  imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80', expiresAt },
      { userId: marcus.id,  imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80', expiresAt },
    ]);
  console.log('✅ Created stories');

  // ── 8. GROUPS ────────────────────────────────────────────────────────────────
          const insertedGroups = await db.insert(groups).values([
      { name: 'Travel & Adventure ✈️', description: 'Share your adventures and destinations!', coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', adminId: alex.id },
      { name: 'Digital Artists United 🎨', description: 'A community for digital artists.', coverPhoto: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80', adminId: maya.id },
      { name: 'Fitness & Health 💪', description: 'Your daily dose of motivation.', coverPhoto: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80', adminId: jordan.id },
      { name: 'Dev & Tech Talk 💻', description: 'Software engineering and tech.', coverPhoto: 'https://images.unsplash.com/photo-1607705703571-c5a8695f18f6?w=800&q=80', adminId: sophie.id },
      { name: 'Music & Creative 🎸', description: 'Musicians and creators.', coverPhoto: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80', adminId: marcus.id },
    ]).returning();

          await db.insert(groupMembers).values([
      { groupId: insertedGroups[0].id, userId: alex.id }, { groupId: insertedGroups[0].id, userId: maya.id },
      { groupId: insertedGroups[1].id, userId: maya.id }, { groupId: insertedGroups[1].id, userId: alex.id },
      { groupId: insertedGroups[2].id, userId: jordan.id }, { groupId: insertedGroups[2].id, userId: alex.id },
      { groupId: insertedGroups[3].id, userId: sophie.id }, { groupId: insertedGroups[3].id, userId: alex.id },
      { groupId: insertedGroups[4].id, userId: marcus.id }, { groupId: insertedGroups[4].id, userId: alex.id },
    ]);
  console.log(`✅ Created ${insertedGroups.length} groups with members`);

  // ── 9. NOTIFICATIONS ─────────────────────────────────────────────────────────
          await db.insert(notifications).values([
      { userId: alex.id, actorId: maya.id,   type: 'like',    postId: insertedPosts[0].id, isRead: 0 },
      { userId: alex.id, actorId: jordan.id, type: 'like',    postId: insertedPosts[0].id, isRead: 0 },
      { userId: alex.id, actorId: sophie.id, type: 'comment', postId: insertedPosts[0].id, isRead: 0 },
      { userId: alex.id, actorId: maya.id,   type: 'follow',  isRead: 0 },
    ]);
  console.log('✅ Created notifications');

  console.log('\n🎉 Seed complete!');
  console.log('\n👤 Sample accounts:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  insertedUsers.forEach(u => {
    console.log(`  📧 ${u.email}  `);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seed().catch(console.error).finally(() => process.exit(0));
