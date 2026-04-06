import { lookup } from "node:dns/promises";
import { createLogger } from "@bonplan/shared";
import { type Browser, type BrowserContext, chromium, type Page } from "patchright-core";
import { checkForBlock } from "../parsing/parser";

const logger = createLogger("scraper");

export type BrowserConnection = {
	browser: Browser;
	context: BrowserContext;
	isNew: boolean;
};

let cachedBrowser: Browser | null = null;
let cachedContext: BrowserContext | null = null;
let pageCount = 0;
const MAX_PAGES_BEFORE_RETIREMENT = 50;
let connectingPromise: Promise<BrowserConnection> | null = null;

export const getOrCreateConnection = async (browserWsUrl: string): Promise<BrowserConnection> => {
	if (connectingPromise) return connectingPromise;

	connectingPromise = (async () => {
		try {
			// Check if browser needs retirement
			if (cachedBrowser && pageCount >= MAX_PAGES_BEFORE_RETIREMENT) {
				logger.info("Browser retirement after max pages", { pageCount });
				await cachedBrowser.close().catch(() => {});
				cachedBrowser = null;
				cachedContext = null;
				pageCount = 0;
			}

			if (cachedBrowser?.isConnected()) {
				return { browser: cachedBrowser, context: cachedContext as BrowserContext, isNew: false };
			}

			// Chrome CDP rejects Host headers with hostnames (only accepts localhost/IP)
			// Resolve the hostname to IP so Chrome accepts the connection
			const cdpUrl = new URL(browserWsUrl.replace(/^ws:\/\//, "http://").replace(/^wss:\/\//, "https://"));
			let resolvedHost = cdpUrl.hostname;
			try {
				const { address } = await lookup(cdpUrl.hostname);
				resolvedHost = address;
				logger.info("Resolved browser host to IP", { hostname: cdpUrl.hostname, ip: address });
			} catch {
				logger.warn("DNS lookup failed, using hostname as-is", { hostname: cdpUrl.hostname });
			}

			const cdpBase = `http://${resolvedHost}:${cdpUrl.port}`;
			let wsEndpoint = `ws://${resolvedHost}:${cdpUrl.port}`;
			try {
				const res = await fetch(`${cdpBase}/json/version`, { signal: AbortSignal.timeout(15000) });
				const json = (await res.json()) as { webSocketDebuggerUrl?: string };
				if (json.webSocketDebuggerUrl) {
					wsEndpoint = json.webSocketDebuggerUrl;
				}
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				logger.warn("Could not fetch /json/version", { error: errMsg });
			}
			logger.info("Connecting to browser via CDP", { wsEndpoint });
			const browser = await chromium.connectOverCDP(wsEndpoint);

			const context =
				browser.contexts()[0] ??
				(await browser.newContext({
					locale: "fr-FR",
					viewport: { width: 1920, height: 1080 },
				}));

			cachedBrowser = browser;
			cachedContext = context;
			pageCount = 0;

			browser.on("disconnected", () => {
				logger.warn("Browser disconnected event received");
				cachedBrowser = null;
				cachedContext = null;
				pageCount = 0;
			});

			logger.info("Browser connected", { url: browserWsUrl });
			return { browser, context, isNew: true };
		} finally {
			connectingPromise = null;
		}
	})();

	return connectingPromise;
};

export const createPage = async (context: BrowserContext): Promise<Page> => {
	const page = await context.newPage();
	pageCount++;
	// No need to set viewport — inherited from context
	// No need to override navigator.webdriver — Patchright handles this automatically
	return page;
};

/** Lightweight page that blocks images/CSS/fonts — for enrichment only. */
export const createLightPage = async (context: BrowserContext): Promise<Page> => {
	const page = await context.newPage();
	pageCount++;
	// Block heavy resources via route interception
	await page.route("**/*.{png,jpg,jpeg,gif,svg,webp,css,woff,woff2,ttf,mp4,webm}", (route) => route.abort());
	return page;
};

export const closeConnection = async (): Promise<void> => {
	if (cachedBrowser) {
		await cachedBrowser.close().catch(() => {});
		cachedBrowser = null;
		cachedContext = null;
		pageCount = 0;
	}
};

export const randomDelay = async (minMs: number, maxMs: number): Promise<void> => {
	const delay = minMs + Math.random() * (maxMs - minMs);
	await new Promise((resolve) => setTimeout(resolve, delay));
};

export type NavigationResult = {
	status: number | null;
	blocked: boolean;
	reason: string;
};

export const navigateWithRetry = async (page: Page, url: string, maxRetries = 3): Promise<NavigationResult> => {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		if (attempt > 1) {
			await randomDelay(2000, 5000);
		}

		try {
			const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
			const status = response?.status() ?? null;

			if (status === 403 || status === 429) {
				if (attempt < maxRetries) {
					logger.warn("Blocked response, retrying", { url, status, attempt });
					continue;
				}
				return { status, blocked: true, reason: `HTTP ${status}` };
			}

			const html = await page.content();
			const title = await page.title();
			const blockCheck = checkForBlock(html, status, title);
			if (blockCheck.blocked) {
				return { status, blocked: true, reason: blockCheck.reason };
			}

			return { status, blocked: false, reason: "" };
		} catch (err) {
			if (attempt === maxRetries) {
				const error = err instanceof Error ? err : new Error(String(err));
				throw error;
			}
			const backoff = 2 ** attempt * 1000;
			logger.warn("Navigation failed, retrying", { url, attempt, backoff });
			await new Promise((resolve) => setTimeout(resolve, backoff));
		}
	}

	throw new Error("Navigation retry loop exited unexpectedly");
};
