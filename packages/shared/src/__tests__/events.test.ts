import { describe, expect, it } from "bun:test";
import { DEAD_LETTER_MAX_LEN, deadLetterStream, STREAM_MAX_LEN, Stream } from "../events";

describe("events constants", () => {
	it("exports Stream enum with all 10 stream names", () => {
		expect(Stream.SearchCreated).toBe("search.created");
		expect(Stream.SearchUpdated).toBe("search.updated");
		expect(Stream.SearchDeleted).toBe("search.deleted");
		expect(Stream.SearchMapped).toBe("search.mapped");
		expect(Stream.SearchTrigger).toBe("search.trigger");
		expect(Stream.SearchError).toBe("search.error");
		expect(Stream.SearchBlocked).toBe("search.blocked");
		expect(Stream.ListingsFound).toBe("listings.found");
		expect(Stream.ListingAnalyzed).toBe("listing.analyzed");
		expect(Stream.NotificationSent).toBe("notification.sent");
		expect(Object.values(Stream).length).toBe(10);
	});

	it("exports retention constants", () => {
		expect(STREAM_MAX_LEN).toBe(10000);
		expect(DEAD_LETTER_MAX_LEN).toBe(1000);
	});

	it("deadLetterStream returns correct name", () => {
		expect(deadLetterStream("orchestrator")).toBe("dead-letter.orchestrator");
		expect(deadLetterStream("scraper")).toBe("dead-letter.scraper");
	});
});
