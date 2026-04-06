ALTER TABLE "analyses" ADD COLUMN "image_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "searches" ADD COLUMN "analyze_images" boolean DEFAULT false NOT NULL;