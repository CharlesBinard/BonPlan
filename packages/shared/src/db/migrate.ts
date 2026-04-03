import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { DbInstance } from "./connection";

export const runMigrations = async (db: DbInstance["db"], migrationsFolder: string): Promise<void> => {
	await migrate(db, { migrationsFolder });
};
