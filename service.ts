/**
 * The web service, declared for Prisma Composer (`prisma deploy` / `prisma dev`).
 *
 * This file is a declaration only: what the service is (this Next.js app, built
 * with `next build` and `output: "standalone"`), what it depends on (the
 * Postgres database described by the Prisma contract) and what it exposes (its
 * HTTP port). Which database it gets is decided in `module.ts`.
 *
 * At runtime the app reads its database connection through this declaration:
 * `service.load().db` (see `src/prisma/connection.ts`).
 *
 * Keep this file free of app imports. A deploy bundles it on its own into the
 * boot wrapper that starts the Next.js server, and `prisma deploy` loads it
 * without a bundler, so relative imports carry their `.ts` extension.
 */
import { rawHttpContract } from "@prisma/composer/http";
import nextjs from "@prisma/composer/nextjs";
import { compute } from "@prisma/composer-prisma-cloud";
import { postgres } from "@prisma/composer-prisma-cloud/orm";
import { appData } from "./src/prisma/data-contract.ts";

export default compute({
  name: "web",
  deps: {
    db: postgres(appData),
  },
  // The Next.js app root: the directory holding next.config.ts, .next/ and public/.
  build: nextjs({ module: import.meta.url, appDir: "." }),
  expose: { http: rawHttpContract },
});
