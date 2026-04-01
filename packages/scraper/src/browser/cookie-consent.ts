import { createLogger } from "@bonplan/shared";
import type { Page } from "patchright-core";

const logger = createLogger("scraper");

const DIDOMI_SELECTORS = [
	"#didomi-notice-agree-button",
	'[aria-label="Accepter"]',
	'[aria-label="Tout accepter"]',
	".didomi-continue-without-agreeing",
];

const CONSENT_TIMEOUT_MS = 3000;

export const dismissCookieConsent = async (page: Page): Promise<void> => {
	try {
		const combined = DIDOMI_SELECTORS.join(", ");
		const button = await page.waitForSelector(combined, { timeout: CONSENT_TIMEOUT_MS }).catch(() => null);
		if (button) {
			await button.click();
			logger.info("Cookie consent dismissed", { selector: combined });
			return;
		}
		logger.info("No cookie consent banner found, proceeding");
	} catch {
		logger.info("Cookie consent handling skipped");
	}
};
