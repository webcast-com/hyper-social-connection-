import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

/**
 * Seed script for the authentication schema. Wired via `migrations.seed` in
 * prisma.config.ts, so it runs with: npx prisma db seed
 *
 * Upserts by unique `email` so re-running is idempotent. The users match the
 * app's own Drizzle seed (src/lib/seed.ts) — same demo logins either way.
 */
const DEMO_PASSWORD = "changeme123";

const users = [
  {
    email: "alex@example.com",
    name: "Alex Rivera",
    username: "alex",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
    bio: "📸 Photography enthusiast | ☕ Coffee addict | 🌍 World traveler.",
  },
  {
    email: "maya@example.com",
    name: "Maya Patel",
    username: "maya",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Maya",
    bio: "🎨 Digital artist and designer.",
  },
  {
    email: "jordan@example.com",
    name: "Jordan Kim",
    username: "jordan",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jordan",
    bio: "🏋️ Fitness coach and wellness advocate.",
  },
  {
    email: "sophie@example.com",
    name: "Sophie Chen",
    username: "sophie",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie",
    bio: "👩‍💻 Full-stack engineer.",
  },
  {
    email: "marcus@example.com",
    name: "Marcus Lee",
    username: "marcus",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus",
    bio: "🎸 Musician and content creator.",
  },
];

async function main() {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { ...user },
      create: { ...user, password },
    });
  }
  console.log(`🌱 Seeded ${users.length} users — login with any email above / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
