import type { WsMessage } from "@bonplan/shared";
import { createLogger, createRedis, Stream, subscribe } from "@bonplan/shared";
import type { ServerWebSocket } from "bun";
import type { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { auth } from "./auth";
import { config } from "./db";

const logger = createLogger("gateway-ws");
const { upgradeWebSocket, websocket } = createBunWebSocket();

type WsConnection = {
	ws: ServerWebSocket<unknown>;
	userId: string;
	sessionToken: string;
};

const connections = new Set<WsConnection>();

const sendToUser = (userId: string, message: WsMessage): void => {
	const data = JSON.stringify(message);
	for (const conn of connections) {
		if (conn.userId === userId && conn.ws.readyState === 1) {
			conn.ws.send(data);
		}
	}
};

const subs: Array<{ stop: () => Promise<void> }> = [];
let wsRedis: ReturnType<typeof createRedis> | null = null;

export const cleanupWebSocket = async (): Promise<void> => {
	await Promise.all(subs.map((s) => s.stop()));
	subs.length = 0;
	if (wsRedis) {
		wsRedis.disconnect();
		wsRedis = null;
	}
	logger.info("WS subscriptions cleaned up");
};

// biome-ignore lint/suspicious/noExplicitAny: accept both Hono and OpenAPIHono
export const setupWebSocket = async (app: Hono<any>): Promise<typeof websocket> => {
	app.get(
		"/ws",
		upgradeWebSocket(async (c) => {
			const session = await auth.api.getSession({ headers: c.req.raw.headers });
			if (!session) {
				return {
					onOpen: (_evt, ws) => {
						ws.close(1008, "unauthorized");
					},
				};
			}

			const userId = session.user.id;
			const sessionToken = session.session.token;

			return {
				onOpen: (_evt, ws) => {
					const conn: WsConnection = {
						ws: ws.raw as ServerWebSocket<unknown>,
						userId,
						sessionToken,
					};
					connections.add(conn);
					logger.info("WS connected", { userId });
				},
				onClose: (_evt, ws) => {
					for (const conn of connections) {
						if (conn.ws === (ws.raw as ServerWebSocket<unknown>)) {
							connections.delete(conn);
							break;
						}
					}
					logger.info("WS disconnected", { userId });
				},
			};
		}),
	);

	// Subscribe to streams — type-safe per-stream handlers
	wsRedis = createRedis(config.redisUrl);

	subs.push(
		await subscribe(
			wsRedis,
			Stream.SearchMapped,
			"gateway-ws",
			`gw-${process.pid}`,
			async (payload) => {
				sendToUser(payload.userId, { type: "search.mapped", searchId: payload.searchId, aiContext: payload.aiContext });
			},
			{ logger, serviceName: "gateway-ws" },
		),
	);

	subs.push(
		await subscribe(
			wsRedis,
			Stream.SearchError,
			"gateway-ws",
			`gw-${process.pid}`,
			async (payload) => {
				sendToUser(payload.userId, {
					type: "search.error",
					searchId: payload.searchId,
					source: payload.source,
					error: payload.error,
					errorType: payload.errorType,
				});
			},
			{ logger, serviceName: "gateway-ws" },
		),
	);

	subs.push(
		await subscribe(
			wsRedis,
			Stream.SearchBlocked,
			"gateway-ws",
			`gw-${process.pid}`,
			async (payload) => {
				sendToUser(payload.userId, {
					type: "search.blocked",
					searchId: payload.searchId,
					reason: payload.reason,
					retryAfter: new Date(Date.now() + payload.retryAfter * 1000).toISOString(),
				});
			},
			{ logger, serviceName: "gateway-ws" },
		),
	);

	subs.push(
		await subscribe(
			wsRedis,
			Stream.ListingAnalyzed,
			"gateway-ws",
			`gw-${process.pid}`,
			async (payload) => {
				sendToUser(payload.userId, {
					type: "listing.analyzed",
					searchId: payload.searchId,
					listingId: payload.listingId,
					score: payload.score,
					verdict: payload.verdict,
				});
			},
			{ logger, serviceName: "gateway-ws" },
		),
	);

	subs.push(
		await subscribe(
			wsRedis,
			Stream.ImageAnalysisComplete,
			"gateway-ws",
			`gw-${process.pid}`,
			async (payload) => {
				sendToUser(payload.userId, {
					type: "image.analysis.complete",
					searchId: payload.searchId,
					listingId: payload.listingId,
					originalScore: payload.originalScore,
					adjustedScore: payload.adjustedScore,
				});
			},
			{ logger, serviceName: "gateway-ws" },
		),
	);

	subs.push(
		await subscribe(
			wsRedis,
			Stream.NotificationSent,
			"gateway-ws",
			`gw-${process.pid}`,
			async (payload) => {
				sendToUser(payload.userId, {
					type: "notification.sent",
					notificationId: payload.notificationId,
					channel: payload.channel,
					status: payload.status,
				});
			},
			{ logger, serviceName: "gateway-ws" },
		),
	);

	return websocket;
};
