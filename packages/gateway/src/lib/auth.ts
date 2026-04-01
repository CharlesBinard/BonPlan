import * as schema from "@bonplan/shared";
import { createLogger } from "@bonplan/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { config, db, redis } from "./db";

const logger = createLogger("gateway");

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
		schema,
	}),
	baseURL: process.env.BASE_URL ?? "http://localhost:3000",
	trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "http://localhost:5173,http://localhost:3000")
		.split(",")
		.map((s) => s.trim()),
	secret: config.betterAuthSecret as string,
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		password: {
			async hash(password) {
				if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
					throw new Error("Password must contain at least one letter and one number");
				}
				return Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });
			},
			async verify({ hash, password }) {
				return Bun.password.verify(password, hash);
			},
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
	},
	secondaryStorage: {
		get: async (key) => {
			const val = await redis.get(`ba:session:${key}`);
			return val ?? null;
		},
		set: async (key, value, ttl) => {
			if (ttl) {
				await redis.set(`ba:session:${key}`, value, "EX", ttl);
			} else {
				await redis.set(`ba:session:${key}`, value);
			}
		},
		delete: async (key) => {
			await redis.del(`ba:session:${key}`);
		},
	},
	rateLimit: {
		window: 60,
		max: 100, // generous in dev, tighten for production
		storage: "secondary-storage",
	},
	account: {
		accountLinking: {
			enabled: false,
		},
	},
	advanced: {
		database: {
			generateId: () => crypto.randomUUID(),
		},
	},
	databaseHooks: {
		session: {
			create: {
				after: async (session) => {
					logger.security("login_success", {
						userId: session.userId,
						sessionId: session.id,
					});
				},
			},
		},
		user: {
			create: {
				after: async (user) => {
					logger.security("registration", {
						userId: user.id,
						email: user.email,
					});
				},
			},
		},
	},
});

export type AuthSession = typeof auth.$Infer.Session;
