import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load local overrides first, then the repository's .env fallback. Next.js
// loads both automatically, so drizzle-kit must do the same or `db:push`
// silently receives an empty DATABASE_URL when only .env is present.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
