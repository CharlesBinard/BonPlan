ALTER TABLE "searches" ADD COLUMN "custom_instructions" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_custom_instructions" text;--> statement-breakpoint
ALTER TABLE "searches" ADD CONSTRAINT "custom_instructions_length" CHECK ("searches"."custom_instructions" IS NULL OR length("searches"."custom_instructions") <= 500);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "ai_custom_instructions_length" CHECK ("users"."ai_custom_instructions" IS NULL OR length("users"."ai_custom_instructions") <= 500);