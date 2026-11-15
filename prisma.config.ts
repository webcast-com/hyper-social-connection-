import "dotenv/config";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig, prisma7Schema } from "@prisma/orm-postgres/config";

// Prisma ORM 8 configuration.
//
// The contract source is still the existing Prisma 7 schema
// (prisma/schema.prisma). `prisma contract emit` compiles it into
// src/prisma/contract.json + src/prisma/contract.d.ts, which the Prisma 8
// client in src/prisma/db.ts reads. Migrations live in migrations/app.
export default definePrismaConfig({
  orm: ormConfig({
    contract: prisma7Schema("prisma/schema.prisma"),
    output: "src/prisma",
    db: {
      connection: process.env["DATABASE_URL"]!,
    },
  }),
});
