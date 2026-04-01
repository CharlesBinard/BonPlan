import { createLogger } from "@bonplan/shared";
import type { Page, Response } from "patchright-core";

const logger = createLogger("scraper");

export type XhrResult = {
	ads: unknown[];
	url: string;
};

export function setupXhrInterceptor(page: Page): { getAds: () => XhrResult | null; cleanup: () => void } {
	let result: XhrResult | null = null;

	const handler = async (response: Response) => {
		const url = response.url();
		if (!url.includes("api.leboncoin.fr") && !url.includes("finder/search")) return;
		try {
			const contentType = response.headers()["content-type"] ?? "";
			if (!contentType.includes("application/json")) return;
			const json = await response.json();
			const ads = json?.ads ?? json?.results ?? json?.data?.ads;
			if (Array.isArray(ads) && ads.length > 0) {
				result = { ads, url };
				logger.info("XHR intercepted listing data", { url, count: ads.length });
			}
		} catch {
			// Response may not be JSON or already consumed
		}
	};

	page.on("response", handler);
	return {
		getAds: () => result,
		cleanup: () => {
			page.off("response", handler);
		},
	};
}
