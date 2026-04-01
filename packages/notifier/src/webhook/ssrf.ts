// packages/notifier/src/webhook/ssrf.ts
import { createLogger } from "@bonplan/shared";

const logger = createLogger("notifier");

// ── IPv4 private range detection ───────────────────────────────────

export const isPrivateIpV4 = (ip: string): boolean => {
	const parts = ip.split(".").map(Number);
	if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
	const [a, b] = parts as [number, number, number, number];

	if (a === 127) return true; // Loopback
	if (a === 10) return true; // RFC1918
	if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
	if (a === 192 && b === 168) return true; // RFC1918
	if (a === 169 && b === 254) return true; // Link-local
	if (a === 0) return true; // 0.0.0.0/8
	if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT RFC6598
	return false;
};

// ── IPv6 private range detection ───────────────────────────────────

export const isPrivateIpV6 = (ip: string): boolean => {
	const normalized = ip.toLowerCase();
	if (normalized === "::") return true;
	if (normalized === "::1") return true;
	if (normalized.startsWith("fe80:")) return true;
	if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
	if (normalized.startsWith("2001:0000:") || normalized.startsWith("2001:0:")) return true;
	if (normalized.startsWith("100::")) return true;
	// IPv4-mapped IPv6
	if (normalized.startsWith("::ffff:")) {
		const mapped = normalized.slice(7);
		// Dotted notation: ::ffff:10.0.0.1
		if (mapped.includes(".")) return isPrivateIpV4(mapped);
		// Hex notation: ::ffff:a00:1 - convert to IPv4
		const parts = mapped.split(":");
		if (parts.length === 2 && parts[0] && parts[1]) {
			const high = parseInt(parts[0], 16);
			const low = parseInt(parts[1], 16);
			const ipv4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
			return isPrivateIpV4(ipv4);
		}
	}
	return false;
};

// ── URL validation ─────────────────────────────────────────────────

type ValidationResult = { valid: true } | { valid: false; reason: string };

export const validateWebhookUrl = (webhookUrl: string, isDev: boolean): ValidationResult => {
	let url: URL;
	try {
		url = new URL(webhookUrl);
	} catch {
		return { valid: false, reason: "Invalid URL format" };
	}

	const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";

	// HTTPS required (HTTP only for localhost in dev)
	if (url.protocol !== "https:") {
		if (url.protocol === "http:" && isLocalhost && isDev) {
			// Allow HTTP localhost in dev — any port
			return { valid: true };
		}
		return { valid: false, reason: "Webhook must use HTTPS" };
	}

	// Port: only 443 (or default) for non-localhost HTTPS
	if (!isLocalhost) {
		const port = url.port ? Number(url.port) : 443;
		if (port !== 443) {
			return { valid: false, reason: `Non-standard port ${port} not allowed` };
		}
	}

	return { valid: true };
};

// ── DNS resolution + IP validation ─────────────────────────────────

export const validateWebhookIp = async (
	hostname: string,
	userId?: string,
	webhookUrl?: string,
): Promise<ValidationResult> => {
	try {
		const dns = await import("node:dns/promises");

		// Check IPv4
		try {
			const v4Addresses = await dns.resolve4(hostname);
			for (const ip of v4Addresses) {
				if (isPrivateIpV4(ip)) {
					logger.security("ssrf_blocked", { hostname, resolvedIp: ip, userId, webhookUrl });
					return { valid: false, reason: `Hostname resolves to private IPv4: ${ip}` };
				}
			}
		} catch {
			// No A records — OK, might be IPv6-only
		}

		// Check IPv6
		try {
			const v6Addresses = await dns.resolve6(hostname);
			for (const ip of v6Addresses) {
				if (isPrivateIpV6(ip)) {
					logger.security("ssrf_blocked", { hostname, resolvedIp: ip, userId, webhookUrl });
					return { valid: false, reason: `Hostname resolves to private IPv6: ${ip}` };
				}
			}
		} catch {
			// No AAAA records — OK
		}

		return { valid: true };
	} catch {
		return { valid: false, reason: `DNS resolution failed for ${hostname}` };
	}
};
