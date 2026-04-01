import { describe, expect, it, spyOn } from "bun:test";
import { createLogger } from "../logger";

describe("createLogger", () => {
	it("logs JSON to stdout with service name", () => {
		const logger = createLogger("gateway");
		const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
		logger.info("server started", { port: 3000 });

		expect(spy).toHaveBeenCalledTimes(1);
		const output = String(spy.mock.calls[0]?.[0]);
		const parsed = JSON.parse(output) as Record<string, unknown>;

		expect(parsed.level).toBe("info");
		expect(parsed.service).toBe("gateway");
		expect(parsed.msg).toBe("server started");
		expect(parsed.port).toBe(3000);
		expect(parsed.timestamp).toBeDefined();
		spy.mockRestore();
	});

	it("tags security events with category and warn level", () => {
		const logger = createLogger("gateway");
		const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
		logger.security("login_failed", { userId: "123", ip: "1.2.3.4" });

		const output = String(spy.mock.calls[0]?.[0]);
		const parsed = JSON.parse(output) as Record<string, unknown>;

		expect(parsed.level).toBe("warn");
		expect(parsed.category).toBe("security");
		expect(parsed.event).toBe("login_failed");
		expect(parsed.userId).toBe("123");
		spy.mockRestore();
	});

	it("logs errors at error level", () => {
		const logger = createLogger("scraper");
		const spy = spyOn(process.stdout, "write").mockImplementation(() => true);
		logger.error("connection failed", { host: "localhost" });

		const output = String(spy.mock.calls[0]?.[0]);
		const parsed = JSON.parse(output) as Record<string, unknown>;

		expect(parsed.level).toBe("error");
		expect(parsed.service).toBe("scraper");
		spy.mockRestore();
	});
});
