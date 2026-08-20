import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * Connectivity check: performs one real read against the database.
 *   npx tsx scripts/verify-prisma.ts
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Run `prisma postgres link --database <id>` " +
        "to write it to .env, or add it manually.",
    );
  }

  // One read. findMany rather than a raw query so it exercises the generated
  // client, the pg driver adapter, and the migrated schema together.
  const users = await prisma.user.findMany({
    include: { posts: { select: { title: true, published: true } } },
    orderBy: { id: "asc" },
  });

  console.log("✅ Connected");
  console.log(`   ${users.length} user(s) found:`);
  for (const u of users) {
    console.log(`   • ${u.name ?? "(no name)"} <${u.email}> — ${u.posts.length} post(s)`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Verification failed. Exact error:\n");
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
