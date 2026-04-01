import { createMiddleware } from "hono/factory";

export const securityHeaders = createMiddleware(async (c, next) => {
	const path = c.req.path;
	if (path === "/docs" || path === "/openapi.json") {
		await next();
		return;
	}

	await next();
	c.header("X-Content-Type-Options", "nosniff");
	c.header("X-Frame-Options", "DENY");
	c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
	c.header(
		"Content-Security-Policy",
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://*.leboncoin.fr https://*.lbc.prod.statics.cloud data:; connect-src 'self' ws: wss:",
	);
});
