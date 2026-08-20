import { prisma, hasDatabase } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { ensureMigrated } from '@/lib/migrate';

export async function ensureSeeded() {
  if (!hasDatabase) return;
  try {
    await ensureMigrated();
    const existing = await prisma.user.findFirst({ select: { id: true } });
    if (existing) {
      return;
    }

    console.log('🌱 Database is empty. Running auto-seed...');

    const password = await bcrypt.hash('changeme123', 10);

    const mkUser = (data: { name: string; email: string; avatar: string; coverPhoto: string; bio: string }) =>
      prisma.user.create({ data: { ...data, password } });

    const alex = await mkUser({ name: 'Alex Rivera', email: 'alex@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex', coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&q=80', bio: '📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler.' });
    const maya = await mkUser({ name: 'Maya Patel', email: 'maya@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maya', coverPhoto: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1200&q=80', bio: '🎨 Digital artist and designer.' });
    const jordan = await mkUser({ name: 'Jordan Kim', email: 'jordan@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan', coverPhoto: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80', bio: '🏋️ Fitness coach and wellness advocate.' });
    const sophie = await mkUser({ name: 'Sophie Chen', email: 'sophie@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie', coverPhoto: 'https://images.unsplash.com/photo-1490750967868-88df5691cc11?w=1200&q=80', bio: '👩‍💻 Full-stack engineer.' });
    const marcus = await mkUser({ name: 'Marcus Lee', email: 'marcus@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus', coverPhoto: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80', bio: '🎸 Musician and content creator.' });

    const mkPost = (userId: number, content: string, imageUrl?: string) =>
      prisma.post.create({ data: { userId, content, imageUrl, privacy: 'public' } });

    const p0 = await mkPost(alex.id, '🌄 Just got back from an incredible trip to the Swiss Alps!', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80');
    const p1 = await mkPost(alex.id, '☕ Sunday mornings are for slow coffee and good vibes.');
    const p2 = await mkPost(maya.id, '🎨 Just finished my latest digital painting — took 40+ hours!', 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80');
    const p3 = await mkPost(maya.id, 'Had the most amazing day at the botanical gardens with my pup.', 'https://images.unsplash.com/photo-1586671267731-da2cf3ceeb80?w=800&q=80');
    const p4 = await mkPost(jordan.id, '💪 New PR today! Deadlifted 200kg!', 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80');
    const p5 = await mkPost(jordan.id, '🚴 50-mile morning ride done!');
    const p6 = await mkPost(sophie.id, '🚀 Shipped a major feature after a 72-hour sprint.');
    const p7 = await mkPost(sophie.id, '🎮 Gaming night was chaotic but the best time!', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80');
    const p8 = await mkPost(marcus.id, '🎸 Dropped a new original track today!', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80');

    await prisma.like.createMany({
      data: [
        { postId: p0.id, userId: maya.id }, { postId: p0.id, userId: jordan.id },
        { postId: p0.id, userId: sophie.id }, { postId: p0.id, userId: marcus.id },
        { postId: p1.id, userId: maya.id },
        { postId: p2.id, userId: alex.id }, { postId: p2.id, userId: sophie.id },
        { postId: p3.id, userId: alex.id },
        { postId: p4.id, userId: alex.id }, { postId: p4.id, userId: marcus.id },
        { postId: p5.id, userId: maya.id },
        { postId: p6.id, userId: alex.id }, { postId: p6.id, userId: jordan.id },
        { postId: p7.id, userId: maya.id },
        { postId: p8.id, userId: alex.id },
      ],
    });

    await prisma.comment.createMany({
      data: [
        { postId: p0.id, userId: maya.id, content: 'Oh my gosh, this is STUNNING!' },
        { postId: p0.id, userId: jordan.id, content: 'I hiked that same trail last summer!' },
        { postId: p2.id, userId: alex.id, content: 'This is INCREDIBLE, Maya!!' },
        { postId: p2.id, userId: sophie.id, content: 'HOW?! Absolute genius!' },
        { postId: p4.id, userId: alex.id, content: 'BEAST MODE!' },
        { postId: p6.id, userId: alex.id, content: 'You are a machine Sophie!!' },
        { postId: p8.id, userId: alex.id, content: 'This track is an absolute BANGER!' },
      ],
    });

    await prisma.follow.createMany({
      data: [
        { followerId: alex.id, followingId: maya.id }, { followerId: alex.id, followingId: jordan.id },
        { followerId: alex.id, followingId: sophie.id }, { followerId: alex.id, followingId: marcus.id },
        { followerId: maya.id, followingId: alex.id },
        { followerId: jordan.id, followingId: alex.id },
        { followerId: sophie.id, followingId: alex.id },
        { followerId: marcus.id, followingId: alex.id },
      ],
    });

    await prisma.message.createMany({
      data: [
        { senderId: maya.id, receiverId: alex.id, content: 'Hey Alex! That Alps photo is stunning 😍' },
        { senderId: alex.id, receiverId: maya.id, content: 'Thanks Maya!!' },
        { senderId: jordan.id, receiverId: alex.id, content: 'Bro your fitness posts are getting me back in the gym!' },
        { senderId: sophie.id, receiverId: alex.id, content: 'Alex!! We need a dev for the new side project 👀' },
        { senderId: marcus.id, receiverId: alex.id, content: 'This track is an absolute BANGER!' },
      ],
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.story.createMany({
      data: [
        { userId: alex.id, imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80', expiresAt },
        { userId: maya.id, imageUrl: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=400&q=80', expiresAt },
        { userId: jordan.id, imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80', expiresAt },
        { userId: sophie.id, imageUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&q=80', expiresAt },
        { userId: marcus.id, imageUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80', expiresAt },
      ],
    });

    const mkGroup = (data: { name: string; description: string; coverPhoto: string; adminId: number }) =>
      prisma.group.create({ data });

    const g0 = await mkGroup({ name: 'Travel & Adventure ✈️', description: 'Share your adventures and destinations!', coverPhoto: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', adminId: alex.id });
    const g1 = await mkGroup({ name: 'Digital Artists United 🎨', description: 'A community for digital artists.', coverPhoto: 'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?w=800&q=80', adminId: maya.id });
    const g2 = await mkGroup({ name: 'Fitness & Health 💪', description: 'Your daily dose of motivation.', coverPhoto: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80', adminId: jordan.id });
    const g3 = await mkGroup({ name: 'Dev & Tech Talk 💻', description: 'Software engineering and tech.', coverPhoto: 'https://images.unsplash.com/photo-1607705703571-c5a8695f18f6?w=800&q=80', adminId: sophie.id });
    const g4 = await mkGroup({ name: 'Music & Creative 🎸', description: 'Musicians and creators.', coverPhoto: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80', adminId: marcus.id });

    await prisma.groupMember.createMany({
      data: [
        { groupId: g0.id, userId: alex.id }, { groupId: g0.id, userId: maya.id },
        { groupId: g1.id, userId: maya.id }, { groupId: g1.id, userId: alex.id },
        { groupId: g2.id, userId: jordan.id }, { groupId: g2.id, userId: alex.id },
        { groupId: g3.id, userId: sophie.id }, { groupId: g3.id, userId: alex.id },
        { groupId: g4.id, userId: marcus.id }, { groupId: g4.id, userId: alex.id },
      ],
    });

    await prisma.notification.createMany({
      data: [
        { userId: alex.id, actorId: maya.id, type: 'like', postId: p0.id, isRead: 0 },
        { userId: alex.id, actorId: jordan.id, type: 'like', postId: p0.id, isRead: 0 },
        { userId: alex.id, actorId: sophie.id, type: 'comment', postId: p0.id, isRead: 0 },
        { userId: alex.id, actorId: maya.id, type: 'follow', isRead: 0 },
      ],
    });

    console.log('🌱 Seed successful!');
  } catch (error) {
    console.error('Seed error:', error);
  }
}
