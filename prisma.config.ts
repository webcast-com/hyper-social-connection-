import "dotenv/config";
import { defineConfig as composer } from "@prisma/composer/config";
import { nextjsBuild } from "@prisma/composer/nextjs/control";
import { prismaCloud, prismaState } from "@prisma/composer-prisma-cloud/control";
import { defineConfig as ormConfig, prisma7Schema } from "@prisma/orm-postgres/config";
import { definePrismaConfig } from "prisma/config";
import { chooseDatabaseUrl } from "./src/prisma/database-url";
import { cliConnectionString } from "./src/prisma/tls";

// Prisma 8 configuration. App code never imports this file.
export default definePrismaConfig({
  // Prisma Composer: what `prisma deploy` and `prisma dev` deploy and how.
  //
  // `entry` is the file whose default export is the app (module.ts). The
  // project is created in `region` the first time the app is deployed to a
  // workspace that does not have it yet; an existing project keeps its region.
  composer: composer({
    entry: "./module.ts",
    extensions: [prismaCloud({ region: "us-east-1" }), nextjsBuild()],
    state: prismaState(),
  }),

  // Prisma ORM.
  //
  // The contract source is still the Prisma schema (prisma/schema.prisma).
  // `prisma contract emit` compiles it into src/prisma/contract.json +
  // src/prisma/contract.d.ts, which the client in src/prisma/db.ts reads.
  // Migrations live in migrations/app.
  //
  // `db.connection` is what the `prisma db …` commands connect to. A Composer
  // deploy does not use it: it connects to the database it provisioned.
  //
  // The address comes from DATABASE_URL, or from the variables the Supabase ↔
  // Vercel integration sets; one that points at Prisma Postgres is skipped
  // while that is paused (src/prisma/database-url.ts).
  //
  // `cliConnectionString` applies the same TLS settings the app uses
  // (DATABASE_SSL, DATABASE_CA_CERT; see src/prisma/tls.ts). With Supabase,
  // run these commands on the session pooler string (port 5432), the mode
  // Supabase recommends for schema changes; see DATABASE.md.
  orm: ormConfig({
    contract: prisma7Schema("prisma/schema.prisma"),
    output: "src/prisma",
    db: {
      connection: cliConnectionString(chooseDatabaseUrl().url ?? undefined)!,
    },
  }),
});
