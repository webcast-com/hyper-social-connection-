/**
 * The app's data contract, wrapped for Prisma Composer.
 *
 * This one value is referenced by both ends of the database wiring: the
 * database that `module.ts` provisions, and the dependency `service.ts`
 * declares on it. Because both ends share it, a deploy refuses to wire the app
 * to a database whose schema does not match the committed contract.
 *
 * `prisma deploy` loads this file directly (no bundler), so its relative
 * imports carry their `.ts` / `.json` extensions.
 */
import { dataContract } from "@prisma/composer-prisma-cloud/orm";
import type { Contract } from "./contract.d.ts";
import contractJson from "./contract.json" with { type: "json" };

export const appData = dataContract<Contract>(contractJson);
