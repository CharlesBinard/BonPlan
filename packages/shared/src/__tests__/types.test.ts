import { describe, expect, it } from "bun:test";
import { getScoreBand, ScoreBand } from "../types";

describe("getScoreBand", () => {
	it("returns Exceptional for scores 90-100", () => {
		expect(getScoreBand(90)).toBe(ScoreBand.Exceptional);
		expect(getScoreBand(95)).toBe(ScoreBand.Exceptional);
		expect(getScoreBand(100)).toBe(ScoreBand.Exceptional);
	});

	it("returns Good for scores 70-89", () => {
		expect(getScoreBand(70)).toBe(ScoreBand.Good);
		expect(getScoreBand(89)).toBe(ScoreBand.Good);
	});

	it("returns Fair for scores 50-69", () => {
		expect(getScoreBand(50)).toBe(ScoreBand.Fair);
		expect(getScoreBand(69)).toBe(ScoreBand.Fair);
	});

	it("returns Overpriced for scores 30-49", () => {
		expect(getScoreBand(30)).toBe(ScoreBand.Overpriced);
		expect(getScoreBand(49)).toBe(ScoreBand.Overpriced);
	});

	it("returns Poor for scores 0-29", () => {
		expect(getScoreBand(0)).toBe(ScoreBand.Poor);
		expect(getScoreBand(29)).toBe(ScoreBand.Poor);
	});
});
