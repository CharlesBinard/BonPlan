import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DbInstance = {
	db: PostgresJsDatabase<typeof schema>;
	client: ReturnType<typeof postgres>;
};

export const createDb = (databaseUrl: string): DbInstance => {
	const client = postgres(databaseUrl, {
		max: 10,
		idle_timeout: 30,
		connect_timeout: 10,
	});
	const db = drizzle(client, { schema });
	return { db, client };
};
