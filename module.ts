/**
 * The app, as Prisma Composer deploys it. `prisma deploy` and `prisma dev`
 * read this file's default export (see the `composer` section of
 * `prisma.config.ts`).
 *
 *   site (public URL) ──▶ web (this Next.js app) ──▶ database (Postgres)
 *
 * Every environment gets its own copy of all three: `production` from the
 * default branch, and one per other branch that is deployed.
 *
 * The name passed to `appRoot` is the name of the Prisma project the app
 * deploys into: "hyper-social-connection-", the project the repository is
 * connected to in the Prisma Console. The trailing hyphen is part of the name.
 * A deploy looks the project up by that exact name in the workspace and
 * creates it when it does not exist, so changing the name here deploys a
 * second, empty copy of the app instead of updating this one.
 *
 * Locally, run the app with `npm run prisma:dev`, which passes
 * `--name hyper-social-connection`. A name ending in a hyphen puts a double
 * underscore in the service's setting names, and the local state files of
 * `prisma dev` misread that: every second start deletes the service's settings
 * and fails with "missing required config param". Deploys keep their state on
 * Prisma Cloud, which stores those names differently.
 *
 * The ids below ("database", "web", "site") name the deployed resources.
 * Changing one deletes the old resource and creates a new one; for the
 * database that means its data.
 */
import { appRoot } from "@prisma/composer";
import { publicUrl } from "@prisma/composer-prisma-cloud";
import { postgres } from "@prisma/composer-prisma-cloud/orm";
import webService from "./service.ts";
import { appData } from "./src/prisma/data-contract.ts";

export default appRoot("hyper-social-connection-", ({ provision }) => {
  // A deploy applies the committed migrations in migrations/app to this
  // database before the web service starts. `config` is how it finds them.
  const database = provision(
    postgres({ name: "database", contract: appData, config: "./prisma.config.ts" }),
    { id: "database" },
  );

  const web = provision(webService, { id: "web", deps: { db: database } });

  // Serve the app on the hostname Prisma gives the service (*.prisma.build).
  // To use your own domain, replace the url with publicUrl.hostname("example.com")
  // after publishing its DNS records.
  provision(publicUrl({ id: "site", url: publicUrl.prismaBuild(), target: web.http }));
});
