import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * Seed script. Wired via `migrations.seed` in prisma.config.ts, so it runs
 * with: npx prisma db seed
 *
 * Uses upsert on the unique `email` so re-running is idempotent rather than
 * creating duplicate users on every invocation.
 */
const users = [
  {
    email: "alice@example.com",
    name: "Alice",
    posts: [
      { title: "Hello world", content: "First post from the seed script.", published: true },
      { title: "Draft thoughts", content: "Still working on this one.", published: false },
    ],
  },
  {
    email: "bob@example.com",
    name: "Bob",
    posts: [{ title: "Prisma Postgres is live", content: "Connected via the pg driver adapter.", published: true }],
  },
  {
    email: "carol@example.com",
    name: "Carol",
    posts: [],
  },
];

async function main() {
  for (const { email, name, posts } of users) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name },
      create: { email, name },
    });

    for (const post of posts) {
      // No unique constraint on title, so guard against duplicates by hand.
      const existing = await prisma.post.findFirst({
        where: { title: post.title, authorId: user.id },
        select: { id: true },
      });
      if (existing) {
        await prisma.post.update({ where: { id: existing.id }, data: post });
      } else {
        await prisma.post.create({ data: { ...post, authorId: user.id } });
      }
    }
  }

  const [userCount, postCount] = await Promise.all([prisma.user.count(), prisma.post.count()]);
  console.log(`🌱 Seed complete — ${userCount} users, ${postCount} posts.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Seed failed:");
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
