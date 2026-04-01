// packages/scraper/src/dedup.ts

import { createLogger, listings, priceHistory, searches } from "@bonplan/shared";
import { eq, sql } from "drizzle-orm";
import type { RawListing } from "../parsing/parser";

const logger = createLogger("scraper");

type Db = ReturnType<typeof import("@bonplan/shared")["createDb"]>["db"];

export type InsertedListing = {
	id: string;
	lbcId: string;
};

export const insertNewListings = async (
	db: Db,
	searchId: string,
	userId: string,
	rawListings: RawListing[],
): Promise<InsertedListing[]> => {
	if (rawListings.length === 0) return [];

	const now = new Date();
	const values = rawListings.map((raw) => ({
		searchId,
		userId,
		lbcId: raw.lbcId,
		title: raw.title,
		price: raw.price,
		description: raw.description,
		images: raw.images,
		url: raw.url,
		sellerType: raw.sellerType,
		location: raw.location,
		rawData: raw.rawData,
	}));

	let results: { id: string; lbcId: string; createdAt: Date }[];
	try {
		results = await db
			.insert(listings)
			.values(values)
			.onConflictDoUpdate({
				target: [listings.searchId, listings.lbcId],
				set: {
					// Backfill description if existing is empty and new one is not
					description: sql`CASE WHEN ${listings.description} = '' AND excluded.description != '' THEN excluded.description ELSE ${listings.description} END`,
					price: sql`excluded.price`,
					updatedAt: now,
				},
			})
			.returning({ id: listings.id, lbcId: listings.lbcId, createdAt: listings.createdAt });
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		logger.error("Failed to batch insert listings", { searchId, count: rawListings.length, error: error.message });
		return [];
	}

	// Build a lookup from lbcId -> price for price history
	const priceByLbcId = new Map(rawListings.map((raw) => [raw.lbcId, raw.price]));

	// Determine which listings are newly inserted (createdAt within the last 30 seconds)
	const inserted: InsertedListing[] = [];
	const priceRecords: { listingId: string; price: number }[] = [];
	for (const result of results) {
		const price = priceByLbcId.get(result.lbcId);
		if (price !== undefined) {
			priceRecords.push({ listingId: result.id, price });
		}
		const isNew = now.getTime() - result.createdAt.getTime() < 30_000;
		if (isNew) {
			inserted.push({ id: result.id, lbcId: result.lbcId });
		}
	}

	// Record price history for all upserted listings (append-only timeline)
	if (priceRecords.length > 0) {
		try {
			await db.insert(priceHistory).values(priceRecords);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			logger.error("Failed to insert price history", { searchId, count: priceRecords.length, error: error.message });
		}
	}

	logger.info("Deduplication complete", {
		searchId,
		total: rawListings.length,
		new: inserted.length,
		duplicates: rawListings.length - inserted.length,
	});

	return inserted;
};

export const updateLastScraped = async (db: Db, searchId: string, error?: string): Promise<void> => {
	await db
		.update(searches)
		.set({
			lastScrapedAt: new Date(),
			lastError: error ?? null,
			updatedAt: new Date(),
		})
		.where(eq(searches.id, searchId));
};
