CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "searches" ALTER COLUMN "location" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "listing_type" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "allow_bundles" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_history_listing_observed_idx" ON "price_history" USING btree ("listing_id","observed_at");