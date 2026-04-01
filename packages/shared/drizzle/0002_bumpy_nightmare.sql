ALTER TABLE "analyses" ADD COLUMN "provider_used" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_provider" text DEFAULT 'claude' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "ai_provider_valid" CHECK ("users"."ai_provider" IN ('claude', 'openai', 'gemini', 'minimax'));