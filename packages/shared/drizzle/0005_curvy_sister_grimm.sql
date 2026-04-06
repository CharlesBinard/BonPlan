ALTER TABLE "searches" ADD COLUMN "postcode" text;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "latitude_range" CHECK ("searches"."latitude" IS NULL OR "searches"."latitude" BETWEEN -90 AND 90);--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "longitude_range" CHECK ("searches"."longitude" IS NULL OR "searches"."longitude" BETWEEN -180 AND 180);--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "lat_lon_both_or_neither" CHECK (("searches"."latitude" IS NULL) = ("searches"."longitude" IS NULL));