import { db } from '@/db';
import {
  users, posts, comments, likes, follows, messages, notifications, stories, groups, groupMembers,
} from '@/db/schema';
import bcrypt from 'bcryptjs';
import { ensureMigrated } from '@/lib/migrate';

export async function ensureSeeded() {
  try {
    await ensureMigrated();
    const existing = await db.select({ id: users.id }).from(users).limit(1);
    if (existing.length > 0) {
      return;
    }

    console.log('🌱 Database is empty. Running auto-seed...');

    const password = await bcrypt.hash('demo1234', 10);

    const insertedUsers = await db.insert(users).values([
      { name: 'Alex Johnson',    email: 'alex@demo.com',   password, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',   coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80', bio: '📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler. Living life one adventure at a time!' },
      { name: 'Maya Patel',      email: 'maya@demo.com',   password, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maya',   coverPhoto: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=80', bio: '🎨 Digital artist | 🎵 Music lover | 🐾 Dog mom. Creating beauty in everything I touch.' },
      { name: 'Jordan Rivera',   email: 'jordan@demo.com', password, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', coverPhoto: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80', bio: '🏋️ Fitness coach | 🥗 Health nut | 🚴 Cyclist. Every rep counts.' },
      { name: 'Sophie Chen',     email: 'sophie@demo.com', password, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie', coverPhoto: 'https://images.unsplash.com/photo-1490750967868-88df5691cc11?w=1200&q=80', bio: '👩‍💻 Full-stack dev | 🎮 Gamer | 🍜 Foodie. Building the future one commit at a time.' },
      { name: 'Marcus Williams', email: 'marcus@demo.com', password, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus', coverPhoto: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80', bio: '🎸 Musician | 🎬 Filmmaker | ✈️ Wanderlust. Sound is my language.' },
      { name: 'Emma Davis',      email: 'emma@demo.com',   password, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma',   coverPhoto: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=1200&q=80', bio: '📚 Bookworm | ☕ Tea drinker | 🌱 Plant parent.' },
      { name: 'Liam Nguyen',     email: 'liam@demo.com',   password, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Liam',   coverPhoto: 'https://images.unsplash.com/photo-1431440869543-efaf3388c585?w=1200&q=80', bio: '🍳 Chef in training | 🌮 Street food hunter | 🚗 Road tripper.' },
      { name: 'Zara Thompson',   email: 'zara@demo.com',   password, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zara',   coverPhoto: 'https://images.unsplash.com/photo-1431578500526-4d9613015464?w=1200&q=80', bio: '🌸 Fashion blogger | 💄 Makeup artist | 🎀 Style icon.' },
    ]).returning();

    const [alex, maya, jordan, sophie, marcus, emma, liam, zara] = insertedUsers;

    const insertedPosts = await db.insert(posts).values([
      { userId: alex.id,    content: '🌄 Just got back from an incredible trip to the Swiss Alps! The views were absolutely breathtaking. Nothing quite like standing on top of the world. Who else loves mountain adventures? 🏔️❤️', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', privacy: 'public' },
      { userId: alex.id,    content: '☕ Sunday mornings are for slow coffee and good vibes. What\'s everyone up to this weekend? Drop it below! 👇', privacy: 'public' },
      { userId: maya.id,    content: '🎨 Just finished my latest digital painting — took 40+ hours but I\'m so proud of the result! Art is never really finished, just abandoned at the right moment ✨', imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80', privacy: 'public' },
      { userId: maya.id,    content: 'Had the most amazing day at the botanical gardens with my rescue pup Mochi 🐾🌸 He absolutely LOVED the flower fields. My heart is so full right now 💕', imageUrl: 'https://images.unsplash.com/photo-1586671267731-da2cf3ceeb80?w=800&q=80', privacy: 'public' },
      { userId: jordan.id,  content: '💪 New PR today! Deadlifted 200kg for the first time! Years of consistent training, early mornings, and clean eating — it all pays off. Never give up on your goals! 🏋️‍♂️🔥\n\n#FitnessJourney #Gains #NeverQuit', imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80', privacy: 'public' },
      { userId: jordan.id,  content: '🚴 50-mile morning ride done before most people even had breakfast! The road is my therapy. Who\'s joining me next Sunday? 🌅', privacy: 'public' },
      { userId: sophie.id,  content: '🚀 Shipped a major feature today after a 72-hour sprint. The codebase is cleaner, the performance is 3x faster, and I\'m running on pure adrenaline. This is why I love what I do! 💻\n\nPS - Coffee count: 7. Sleep: negotiable.', privacy: 'public' },
      { userId: sophie.id,  content: '🎮 Gaming night was a DISASTER (we lost every match) but honestly the best time I\'ve had in weeks. Sometimes losing with friends is better than winning alone 😂', imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80', privacy: 'public' },
      { userId: marcus.id,  content: '🎸 Dropped a new original track today! Spent the last 3 months writing and recording this in my home studio. It\'s raw, it\'s real, and it\'s all me. Link in bio. Let me know what you think! 🎵🖤', imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80', privacy: 'public' },
      { userId: emma.id,    content: '"The more that you read, the more things you will know." — Dr. Seuss 📚\n\nFinished my 52nd book of the year today. Still going strong! 🌟', imageUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&q=80', privacy: 'public' },
      { userId: liam.id,    content: '🍝 Spent the whole day making fresh pasta from scratch for the first time. Flour everywhere, three failed attempts, but the fourth try? PERFECTION. Nonna would be proud 👨‍🍳❤️', imageUrl: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&q=80', privacy: 'public' },
      { userId: zara.id,    content: '✨ Autumn lookbook is LIVE! This season is all about warm tones, cozy layers, and bold accessories. 🍂👗\n\nWhich look is your fave? Comment below!', imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80', privacy: 'public' },
    ]).returning();

    await db.insert(likes).values([
      { postId: insertedPosts[0].id, userId: maya.id }, { postId: insertedPosts[0].id, userId: jordan.id },
      { postId: insertedPosts[0].id, userId: sophie.id }, { postId: insertedPosts[0].id, userId: marcus.id },
      { postId: insertedPosts[0].id, userId: emma.id }, { postId: insertedPosts[0].id, userId: zara.id },
      { postId: insertedPosts[1].id, userId: maya.id }, { postId: insertedPosts[1].id, userId: liam.id },
      { postId: insertedPosts[2].id, userId: alex.id }, { postId: insertedPosts[2].id, userId: sophie.id },
      { postId: insertedPosts[2].id, userId: zara.id }, { postId: insertedPosts[2].id, userId: jordan.id },
      { postId: insertedPosts[3].id, userId: alex.id }, { postId: insertedPosts[3].id, userId: liam.id },
      { postId: insertedPosts[4].id, userId: alex.id }, { postId: insertedPosts[4].id, userId: marcus.id },
      { postId: insertedPosts[4].id, userId: maya.id }, { postId: insertedPosts[4].id, userId: sophie.id },
      { postId: insertedPosts[5].id, userId: emma.id }, { postId: insertedPosts[5].id, userId: zara.id },
      { postId: insertedPosts[6].id, userId: alex.id }, { postId: insertedPosts[6].id, userId: jordan.id },
      { postId: insertedPosts[7].id, userId: maya.id }, { postId: insertedPosts[7].id, userId: liam.id },
      { postId: insertedPosts[8].id, userId: alex.id }, { postId: insertedPosts[8].id, userId: maya.id },
      { postId: insertedPosts[8].id, userId: zara.id }, { postId: insertedPosts[9].id, userId: sophie.id },
      { postId: insertedPosts[10].id, userId: alex.id }, { postId: insertedPosts[10].id, userId: jordan.id },
      { postId: insertedPosts[11].id, userId: maya.id }, { postId: insertedPosts[11].id, userId: emma.id },
    ]);

    await db.insert(comments).values([
      { postId: insertedPosts[0].id, userId: maya.id,   content: 'Oh my gosh, this is STUNNING! 😍 I need to go there ASAP!' },
      { postId: insertedPosts[0].id, userId: jordan.id, content: 'I hiked that same trail last summer! Best decision of my life 🏔️' },
      { postId: insertedPosts[0].id, userId: sophie.id, content: 'Living vicariously through your photos 😭 Goals!!' },
      { postId: insertedPosts[0].id, userId: liam.id,   content: 'Did you try the fondue there? The food is incredible 🍷' },
      { postId: insertedPosts[1].id, userId: emma.id,   content: 'Same! Sunday slow mornings are sacred ☕📚' },
      { postId: insertedPosts[2].id, userId: alex.id,   content: 'This is INCREDIBLE, Maya!! Your talent never ceases to amaze me 🤩' },
      { postId: insertedPosts[2].id, userId: sophie.id, content: 'HOW?! I can barely draw a stick figure 😂 Absolute genius!' },
      { postId: insertedPosts[2].id, userId: zara.id,   content: 'The colors are so vibrant! Can I commission one? 👀' },
      { postId: insertedPosts[3].id, userId: alex.id,   content: 'Mochi is the CUTEST 😭🐾 Please tell him Alex says hi!' },
      { postId: insertedPosts[4].id, userId: alex.id,   content: 'BEAST MODE! 🔥 That\'s incredible Jordan, so proud of you!' },
      { postId: insertedPosts[4].id, userId: maya.id,   content: 'Wow 200kg?! You make us all want to hit the gym! 💪' },
      { postId: insertedPosts[4].id, userId: liam.id,   content: 'That\'s insane! What\'s your diet like? Asking for a friend 😅' },
      { postId: insertedPosts[6].id, userId: alex.id,   content: 'You are a machine Sophie!! 72 hours is wild 😤 Ship it!!' },
      { postId: insertedPosts[6].id, userId: jordan.id, content: '7 coffees?! My hands start shaking at 3 😂' },
      { postId: insertedPosts[8].id, userId: alex.id,   content: '🔥🔥🔥 This track is an absolute BANGER Marcus! On repeat all day!' },
      { postId: insertedPosts[8].id, userId: zara.id,   content: 'The vibes are immaculate 🎵✨ Can\'t wait for the next one!' },
      { postId: insertedPosts[9].id, userId: sophie.id, content: '52 books!! You are an inspiration Emma 📚' },
      { postId: insertedPosts[10].id, userId: zara.id,  content: 'Okay this looks DELICIOUS. Recipe please?? 🙏😍' },
      { postId: insertedPosts[11].id, userId: maya.id,  content: 'Look 3 is giving me EVERYTHING right now 😍 Stunning!!' },
      { postId: insertedPosts[11].id, userId: emma.id,  content: 'I need look 1 in my life immediately. Link?? 🛍️' },
    ]);

    await db.insert(follows).values([
      { followerId: alex.id,   followingId: maya.id },   { followerId: alex.id,   followingId: jordan.id },
      { followerId: alex.id,   followingId: sophie.id },  { followerId: alex.id,   followingId: marcus.id },
      { followerId: alex.id,   followingId: emma.id },    { followerId: maya.id,   followingId: alex.id },
      { followerId: maya.id,   followingId: zara.id },    { followerId: maya.id,   followingId: sophie.id },
      { followerId: jordan.id, followingId: alex.id },    { followerId: jordan.id, followingId: marcus.id },
      { followerId: jordan.id, followingId: liam.id },    { followerId: sophie.id, followingId: alex.id },
      { followerId: sophie.id, followingId: maya.id },    { followerId: sophie.id, followingId: marcus.id },
      { followerId: marcus.id, followingId: alex.id },    { followerId: marcus.id, followingId: zara.id },
      { followerId: emma.id,   followingId: alex.id },    { followerId: emma.id,   followingId: maya.id },
      { followerId: liam.id,   followingId: alex.id },    { followerId: liam.id,   followingId: jordan.id },
      { followerId: zara.id,   followingId: maya.id },    { followerId: zara.id,   followingId: alex.id },
    ]);

    await db.insert(messages).values([
      { senderId: maya.id,   receiverId: alex.id,  content: 'Hey Alex! That Alps photo is absolutely stunning 😍' },
      { senderId: alex.id,   receiverId: maya.id,  content: 'Thanks Maya!! It was genuinely life-changing ❤️' },
      { senderId: maya.id,   receiverId: alex.id,  content: 'We should plan a group trip next summer!' },
      { senderId: alex.id,   receiverId: maya.id,  content: 'YES! Sophie and Jordan would love it 🏔️' },
      { senderId: jordan.id, receiverId: alex.id,  content: 'Bro your travel posts are getting me back in the gym!' },
      { senderId: alex.id,   receiverId: jordan.id, content: 'Haha let\'s go! Morning workouts are the best 💪' },
      { senderId: jordan.id, receiverId: alex.id,  content: 'Next Sunday 6am - you in? 🏋️' },
      { senderId: alex.id,   receiverId: jordan.id, content: '6am?! Bold. But yeah I\'m in 😂🔥' },
      { senderId: sophie.id, receiverId: alex.id,  content: 'Alex!! We need a dev for the new side project 👀' },
      { senderId: alex.id,   receiverId: sophie.id, content: 'Tell me more... 🤔' },
      { senderId: emma.id,   receiverId: alex.id,  content: 'Have you read "The Alchemist"? Reminded me of your travel posts 📚' },
      { senderId: alex.id,   receiverId: emma.id,  content: 'One of my all time favs!! 🌟' },
      { senderId: liam.id,   receiverId: alex.id,  content: 'Made fresh pasta carbonara — wanna come over? 🍝' },
      { senderId: alex.id,   receiverId: liam.id,  content: 'Don\'t tease me 😭 I\'ll be there in 20 minutes!' },
    ]);

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(stories).values([
      { userId: alex.id,    imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80', expiresAt },
      { userId: maya.id,    imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=400&q=80', expiresAt },
      { userId: jordan.id,  imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80', expiresAt },
      { userId: sophie.id,  imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80', expiresAt },
      { userId: marcus.id,  imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80', expiresAt },
      { userId: zara.id,    imageUrl: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&q=80', expiresAt },
    ]);

    const insertedGroups = await db.insert(groups).values([
      { name: 'Travel & Adventure ✈️', description: 'Share your adventures and destinations from around the world!', coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', adminId: alex.id },
      { name: 'Digital Artists United 🎨', description: 'A community for digital artists, illustrators, and designers.', coverPhoto: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80', adminId: maya.id },
      { name: 'Fitness & Health 💪', description: 'Your daily dose of motivation, workout tips, and transformation stories.', coverPhoto: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80', adminId: jordan.id },
      { name: 'Dev & Tech Talk 💻', description: 'Software engineering, open source, tech news, and career growth.', coverPhoto: 'https://images.unsplash.com/photo-1607705703571-c5a8695f18f6?w=800&q=80', adminId: sophie.id },
      { name: 'Foodies Anonymous 🍕', description: 'Recipes, restaurant reviews, and food photography.', coverPhoto: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&q=80', adminId: liam.id },
    ]).returning();

    await db.insert(groupMembers).values([
      { groupId: insertedGroups[0].id, userId: alex.id }, { groupId: insertedGroups[0].id, userId: maya.id },
      { groupId: insertedGroups[0].id, userId: marcus.id }, { groupId: insertedGroups[0].id, userId: emma.id },
      { groupId: insertedGroups[1].id, userId: maya.id }, { groupId: insertedGroups[1].id, userId: alex.id },
      { groupId: insertedGroups[1].id, userId: zara.id },
      { groupId: insertedGroups[2].id, userId: jordan.id }, { groupId: insertedGroups[2].id, userId: alex.id },
      { groupId: insertedGroups[2].id, userId: liam.id },
      { groupId: insertedGroups[3].id, userId: sophie.id }, { groupId: insertedGroups[3].id, userId: alex.id },
      { groupId: insertedGroups[4].id, userId: liam.id }, { groupId: insertedGroups[4].id, userId: alex.id },
      { groupId: insertedGroups[4].id, userId: zara.id },
    ]);

    await db.insert(notifications).values([
      { userId: alex.id, actorId: maya.id,   type: 'like',    postId: insertedPosts[0].id, isRead: 0 },
      { userId: alex.id, actorId: jordan.id, type: 'like',    postId: insertedPosts[0].id, isRead: 0 },
      { userId: alex.id, actorId: sophie.id, type: 'comment', postId: insertedPosts[0].id, isRead: 0 },
      { userId: alex.id, actorId: maya.id,   type: 'follow',  isRead: 0 },
      { userId: alex.id, actorId: liam.id,   type: 'message', isRead: 0 },
    ]);

    console.log('🌱 Seed successful!');
  } catch (error) {
    console.error('Seed error:', error);
  }
}
