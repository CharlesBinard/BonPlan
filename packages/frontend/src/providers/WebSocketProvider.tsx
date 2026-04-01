import type { WsMessage } from "@bonplan/shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	FEED_QUERY_KEY,
	getGetApiNotificationsQueryKey,
	getGetApiSearchesIdListingsListingIdQueryKey,
	getGetApiSearchesIdListingsQueryKey,
	getGetApiSearchesIdQueryKey,
	getGetApiSearchesQueryKey,
	getGetApiStatsQueryKey,
} from "@/api";
import { useAuth } from "./AuthProvider";

type WsCtx = { isConnected: boolean };
const WsContext = createContext<WsCtx>({ isConnected: false });

export const WebSocketProvider = ({ children }: { children: ReactNode }) => {
	const { isAuthenticated } = useAuth();
	const qc = useQueryClient();
	const wsRef = useRef<WebSocket | null>(null);
	const retryRef = useRef(0);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mountedRef = useRef(true);
	const [isConnected, setIsConnected] = useState(false);

	const connect = useCallback(() => {
		if (!mountedRef.current) return;
		// Don't open a new connection if one is already open/connecting
		if (
			wsRef.current &&
			(wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
		) {
			return;
		}

		const wsUrl =
			import.meta.env.VITE_WS_URL ??
			`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			setIsConnected(true);
			retryRef.current = 0;
		};

		ws.onclose = () => {
			// Only update state if it was previously connected (avoids unnecessary re-renders)
			setIsConnected((prev) => (prev ? false : prev));
			if (!mountedRef.current) return;
			const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
			retryRef.current++;
			timeoutRef.current = setTimeout(connect, delay);
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data) as WsMessage;
				handleMessage(msg, qc);
			} catch {
				// Malformed message — skip
			}
		};
	}, [qc]);

	useEffect(() => {
		mountedRef.current = true;

		if (isAuthenticated) {
			connect();
		}

		return () => {
			mountedRef.current = false;
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			wsRef.current?.close();
		};
	}, [isAuthenticated, connect]);

	return <WsContext.Provider value={{ isConnected }}>{children}</WsContext.Provider>;
};

export const useWebSocket = () => useContext(WsContext);

// ── Handle all 6 WsMessage types ──────────────────────────────────

const handleMessage = (msg: WsMessage, qc: ReturnType<typeof useQueryClient>) => {
	switch (msg.type) {
		case "search.mapped":
			qc.invalidateQueries({ queryKey: getGetApiSearchesIdQueryKey(msg.searchId) });
			qc.invalidateQueries({ queryKey: getGetApiSearchesQueryKey() }); // status changed
			break;

		case "search.error":
			qc.invalidateQueries({ queryKey: getGetApiSearchesIdQueryKey(msg.searchId) });
			qc.invalidateQueries({ queryKey: getGetApiSearchesQueryKey() });
			if (msg.errorType === "invalid_api_key") {
				toast.error("Clé API invalide. Mettez-la à jour dans les paramètres.");
			} else {
				toast.error(`Erreur: ${msg.error}`);
			}
			break;

		case "search.blocked":
			qc.invalidateQueries({ queryKey: getGetApiSearchesIdQueryKey(msg.searchId) });
			qc.invalidateQueries({ queryKey: getGetApiSearchesQueryKey() });
			toast.warning(`Recherche bloquée: ${msg.reason}`);
			break;

		case "listing.analyzed":
			qc.invalidateQueries({ queryKey: getGetApiSearchesIdListingsQueryKey(msg.searchId) });
			qc.invalidateQueries({ queryKey: getGetApiSearchesIdListingsListingIdQueryKey(msg.searchId, msg.listingId) });
			qc.invalidateQueries({ queryKey: getGetApiStatsQueryKey() });
			// Accumulate in feed cache
			qc.setQueryData<WsMessage[]>([...FEED_QUERY_KEY], (old) => [msg, ...(old ?? []).slice(0, 99)]);
			break;

		case "notification.sent":
			qc.invalidateQueries({ queryKey: getGetApiNotificationsQueryKey() });
			break;

		case "auth.expired":
			toast.error("Session expirée, veuillez vous reconnecter.");
			window.location.href = "/auth/login";
			break;
	}
};
