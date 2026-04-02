import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import type { DbInstance } from "./connection";

export const runMigrations = async (db: DbInstance["db"]): Promise<void> => {
	const migrationsFolder = resolve(import.meta.dir, "../../../drizzle");
	await migrate(db, { migrationsFolder });
};
