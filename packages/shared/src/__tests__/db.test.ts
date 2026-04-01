import { describe, expect, it } from "bun:test";
import { createDb } from "../db/connection";

describe("createDb", () => {
	it("exports a createDb function", () => {
		expect(typeof createDb).toBe("function");
	});

	it("returns an object with db and client properties and cleans up", async () => {
		const result = createDb("postgresql://bonplan:bonplan_dev@localhost:5432/bonplan");
		expect(result).toHaveProperty("db");
		expect(result).toHaveProperty("client");
		await result.client.end();
	});
});
