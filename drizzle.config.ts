import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load credentials from .env.local (Next.js style) so the same values
// power both the app and drizzle-kit push/generate.
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
});
