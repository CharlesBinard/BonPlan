CREATE TYPE "public"."notification_channel" AS ENUM('webhook', 'discord');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."search_status" AS ENUM('pending', 'mapping', 'active', 'paused', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."seller_type" AS ENUM('pro', 'particulier');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"search_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"matches_query" boolean NOT NULL,
	"score" integer,
	"verdict" text NOT NULL,
	"market_price_low" integer,
	"market_price_high" integer,
	"red_flags" text[] DEFAULT '{}' NOT NULL,
	"reasoning" text NOT NULL,
	"model_used" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_listing_search_unique" UNIQUE("listing_id","search_id"),
	CONSTRAINT "score_range" CHECK ("analyses"."score" IS NULL OR "analyses"."score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "discord_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"discord_user_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discord_links_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "discord_links_discord_user_id_unique" UNIQUE("discord_user_id")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_listing_unique" UNIQUE("user_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"lbc_id" text NOT NULL,
	"title" text NOT NULL,
	"price" integer NOT NULL,
	"description" text NOT NULL,
	"images" text[] DEFAULT '{}' NOT NULL,
	"url" text NOT NULL,
	"seller_type" "seller_type" NOT NULL,
	"location" text NOT NULL,
	"raw_data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_search_lbc_unique" UNIQUE("search_id","lbc_id"),
	CONSTRAINT "price_positive" CHECK ("listings"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"search_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_analysis_channel_unique" UNIQUE("analysis_id","channel"),
	CONSTRAINT "retry_count_range" CHECK ("notifications"."retry_count" >= 0 AND "notifications"."retry_count" <= 3)
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query" text NOT NULL,
	"location" text NOT NULL,
	"radius_km" integer NOT NULL,
	"interval_min" integer DEFAULT 15 NOT NULL,
	"ai_context" jsonb,
	"status" "search_status" DEFAULT 'pending' NOT NULL,
	"notify_webhook" text,
	"notify_discord" boolean DEFAULT false NOT NULL,
	"discord_channel_id" text,
	"min_score" integer DEFAULT 70 NOT NULL,
	"last_scraped_at" timestamp with time zone,
	"last_error" text,
	"blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "min_score_range" CHECK ("searches"."min_score" BETWEEN 0 AND 100),
	CONSTRAINT "interval_min_minimum" CHECK ("searches"."interval_min" >= 5)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"ai_api_key_encrypted" text,
	"ai_api_key_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_links" ADD CONSTRAINT "discord_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_listing_id_idx" ON "analyses" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "analyses_search_score_idx" ON "analyses" USING btree ("search_id","score");--> statement-breakpoint
CREATE INDEX "analyses_user_id_idx" ON "analyses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "favorites_listing_id_idx" ON "favorites" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listings_search_created_idx" ON "listings" USING btree ("search_id","created_at");--> statement-breakpoint
CREATE INDEX "listings_search_lbc_idx" ON "listings" USING btree ("search_id","lbc_id");--> statement-breakpoint
CREATE INDEX "listings_user_id_idx" ON "listings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "searches_user_id_status_idx" ON "searches" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "searches_user_id_idx" ON "searches" USING btree ("user_id");