// packages/notifier/src/__tests__/ssrf.test.ts
import { describe, expect, it } from "bun:test";
import { isPrivateIpV4, isPrivateIpV6, validateWebhookUrl } from "../webhook/ssrf";

describe("isPrivateIpV4", () => {
	it("detects RFC1918 10.x", () => {
		expect(isPrivateIpV4("10.0.0.1")).toBe(true);
	});

	it("detects RFC1918 172.16-31.x", () => {
		expect(isPrivateIpV4("172.16.0.1")).toBe(true);
		expect(isPrivateIpV4("172.15.0.1")).toBe(false);
	});

	it("detects RFC1918 192.168.x", () => {
		expect(isPrivateIpV4("192.168.1.1")).toBe(true);
	});

	it("detects loopback 127.x", () => {
		expect(isPrivateIpV4("127.0.0.1")).toBe(true);
	});

	it("detects link-local 169.254.x", () => {
		expect(isPrivateIpV4("169.254.1.1")).toBe(true);
	});

	it("allows public IPs", () => {
		expect(isPrivateIpV4("8.8.8.8")).toBe(false);
		expect(isPrivateIpV4("1.1.1.1")).toBe(false);
	});
});

describe("isPrivateIpV6", () => {
	it("detects loopback ::1", () => {
		expect(isPrivateIpV6("::1")).toBe(true);
	});

	it("detects ULA fc00::/7", () => {
		expect(isPrivateIpV6("fc00::1")).toBe(true);
		expect(isPrivateIpV6("fd12::abcd")).toBe(true);
	});

	it("detects link-local fe80::", () => {
		expect(isPrivateIpV6("fe80::1")).toBe(true);
	});

	it("allows public IPv6", () => {
		expect(isPrivateIpV6("2001:db8::1")).toBe(false);
		expect(isPrivateIpV6("2607:f8b0:4004:800::200e")).toBe(false);
	});
});

describe("validateWebhookUrl", () => {
	it("accepts valid HTTPS URL", () => {
		expect(validateWebhookUrl("https://example.com/webhook", false).valid).toBe(true);
	});

	it("rejects HTTP in production", () => {
		expect(validateWebhookUrl("http://example.com/hook", false).valid).toBe(false);
	});

	it("allows HTTP localhost in dev", () => {
		expect(validateWebhookUrl("http://localhost/hook", true).valid).toBe(true);
		expect(validateWebhookUrl("http://localhost:3000/hook", true).valid).toBe(true);
	});

	it("rejects HTTP localhost in production", () => {
		expect(validateWebhookUrl("http://localhost/hook", false).valid).toBe(false);
	});

	it("rejects non-standard ports for non-localhost", () => {
		expect(validateWebhookUrl("https://example.com:8443/hook", false).valid).toBe(false);
	});

	it("allows port 443", () => {
		expect(validateWebhookUrl("https://example.com:443/hook", false).valid).toBe(true);
	});
});
