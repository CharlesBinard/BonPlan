import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
import { PROVIDER_VALUES } from "../ai-models";

// ── Enums
export const sellerTypeEnum = pgEnum("seller_type", ["pro", "particulier"]);
// "discord" kept for historical notification records. New notifications always use "webhook". Do not remove.
export const notificationChannelEnum = pgEnum("notification_channel", ["webhook", "discord"]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "sent", "failed"]);
export const searchStatusEnum = pgEnum("search_status", ["pending", "mapping", "active", "paused", "blocked"]);

// ── Users (Better Auth columns added in Plan 2)
export const users = pgTable(
	"users",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		email: text("email").notNull().unique(),
		name: text("name").notNull().default(""),
		displayName: text("display_name"),
		emailVerified: boolean("email_verified").notNull().default(false),
		image: text("image"),
		aiApiKeyEncrypted: text("ai_api_key_encrypted"),
		aiApiKeyVersion: integer("ai_api_key_version"),
		aiProvider: text("ai_provider").notNull().default("claude"),
		aiModel: text("ai_model"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check(
			"ai_provider_valid",
			sql`${table.aiProvider} IN (${sql.raw(PROVIDER_VALUES.map((v) => `'${v}'`).join(", "))})`,
		),
	],
);

// ── Better Auth: Sessions
export const sessions = pgTable("sessions", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	token: text("token").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Better Auth: Accounts
export const accounts = pgTable("accounts", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
	scope: text("scope"),
	idToken: text("id_token"),
	password: text("password"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Better Auth: Verifications
export const verifications = pgTable("verifications", {
	id: uuid("id").primaryKey().defaultRandom(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Searches
export const searches = pgTable(
	"searches",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		query: text("query").notNull(),
		location: text("location").notNull().default(""),
		postcode: text("postcode"),
		latitude: doublePrecision("latitude"),
		longitude: doublePrecision("longitude"),
		radiusKm: integer("radius_km").notNull(),
		intervalMin: integer("interval_min").notNull().default(15),
		aiContext: jsonb("ai_context"),
		status: searchStatusEnum("status").notNull().default("pending"),
		notifyWebhook: text("notify_webhook"),
		minScore: integer("min_score").notNull().default(70),
		allowBundles: boolean("allow_bundles").notNull().default(false),
		analyzeImages: boolean("analyze_images").notNull().default(false),
		lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
		lastError: text("last_error"),
		blockedUntil: timestamp("blocked_until", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("searches_user_id_status_idx").on(table.userId, table.status),
		index("searches_user_id_idx").on(table.userId),
		check("min_score_range", sql`${table.minScore} BETWEEN 0 AND 100`),
		check("interval_min_minimum", sql`${table.intervalMin} >= 5`),
		check("latitude_range", sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`),
		check("longitude_range", sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`),
		check("lat_lon_both_or_neither", sql`(${table.latitude} IS NULL) = (${table.longitude} IS NULL)`),
	],
);

// ── Listings
export const listings = pgTable(
	"listings",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		searchId: uuid("search_id")
			.notNull()
			.references(() => searches.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		lbcId: text("lbc_id").notNull(),
		title: text("title").notNull(),
		price: integer("price").notNull(),
		description: text("description").notNull(),
		images: text("images").array().notNull().default(sql`'{}'`),
		url: text("url").notNull(),
		sellerType: sellerTypeEnum("seller_type").notNull(),
		location: text("location").notNull(),
		rawData: jsonb("raw_data").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("listings_search_lbc_unique").on(table.searchId, table.lbcId),
		index("listings_search_created_idx").on(table.searchId, table.createdAt),
		index("listings_search_lbc_idx").on(table.searchId, table.lbcId),
		index("listings_user_id_idx").on(table.userId),
		check("price_positive", sql`${table.price} >= 0`),
	],
);

// ── Price History
export const priceHistory = pgTable(
	"price_history",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		listingId: uuid("listing_id")
			.notNull()
			.references(() => listings.id, { onDelete: "cascade" }),
		price: integer("price").notNull(),
		observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("price_history_listing_observed_idx").on(table.listingId, table.observedAt)],
);

// ── Full-Text Search (tsvector)
// Drizzle ORM does not support GENERATED ALWAYS AS columns.
// Run this manually or add to a custom migration:
//
//   ALTER TABLE listings ADD COLUMN search_vector tsvector
//     GENERATED ALWAYS AS (
//       setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
//       setweight(to_tsvector('french', coalesce(description, '')), 'B')
//     ) STORED;
//   CREATE INDEX listings_search_vector_idx ON listings USING GIN (search_vector);

// ── Analyses
export const analyses = pgTable(
	"analyses",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		listingId: uuid("listing_id")
			.notNull()
			.references(() => listings.id, { onDelete: "cascade" }),
		searchId: uuid("search_id")
			.notNull()
			.references(() => searches.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		matchesQuery: boolean("matches_query").notNull(),
		listingType: text("listing_type"),
		score: integer("score"),
		verdict: text("verdict").notNull(),
		marketPriceLow: integer("market_price_low"),
		marketPriceHigh: integer("market_price_high"),
		redFlags: text("red_flags").array().notNull().default(sql`'{}'`),
		reasoning: text("reasoning").notNull(),
		modelUsed: text("model_used").notNull(),
		providerUsed: text("provider_used"),
		comparables: jsonb("comparables").$type<Array<{
			title: string;
			price: number;
			source: string;
			date?: string;
		}> | null>(),
		marketMedian: integer("market_median"),
		discount: integer("discount"),
		imageAnalysis: jsonb("image_analysis").$type<{
			findings: string[];
			condition: string;
			scoreAdjustment: number;
			originalScore: number;
			modelUsed: string;
		} | null>(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("analyses_listing_search_unique").on(table.listingId, table.searchId),
		index("analyses_listing_id_idx").on(table.listingId),
		index("analyses_search_score_idx").on(table.searchId, table.score),
		index("analyses_user_id_idx").on(table.userId),
		check("score_range", sql`${table.score} IS NULL OR ${table.score} BETWEEN 0 AND 100`),
	],
);

// ── Favorites
export const favorites = pgTable(
	"favorites",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		listingId: uuid("listing_id")
			.notNull()
			.references(() => listings.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique("favorites_user_listing_unique").on(table.userId, table.listingId),
		index("favorites_listing_id_idx").on(table.listingId),
	],
);

// ── Notifications
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		searchId: uuid("search_id")
			.notNull()
			.references(() => searches.id, { onDelete: "cascade" }),
		analysisId: uuid("analysis_id")
			.notNull()
			.references(() => analyses.id, { onDelete: "cascade" }),
		channel: notificationChannelEnum("channel").notNull(),
		status: notificationStatusEnum("status").notNull().default("pending"),
		retryCount: integer("retry_count").notNull().default(0),
		payload: jsonb("payload").notNull(),
		error: text("error"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		unique("notifications_analysis_channel_unique").on(table.analysisId, table.channel),
		index("notifications_user_created_idx").on(table.userId, table.createdAt),
		check("retry_count_range", sql`${table.retryCount} >= 0 AND ${table.retryCount} <= 3`),
	],
);

