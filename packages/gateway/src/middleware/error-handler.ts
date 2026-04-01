import { createLogger } from "@bonplan/shared";
import type { Context } from "hono";
import { ZodError } from "zod";

const logger = createLogger("gateway");

export const handleError = (err: Error, c: Context): Response => {
	if (err instanceof ZodError) {
		return c.json({ error: "validation_error", details: err.issues }, 400);
	}
	if (err instanceof SyntaxError && err.message.includes("JSON")) {
		return c.json({ error: "invalid_json" }, 400);
	}
	logger.error("Unhandled error", { error: err.message, stack: err.stack });
	return c.json({ error: "internal_server_error" }, 500);
};
