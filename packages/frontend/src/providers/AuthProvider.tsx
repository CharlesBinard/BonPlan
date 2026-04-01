import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { ApiError, api } from "@/config/api";

const SESSION_QUERY_KEY = ["auth", "session"] as const;

type User = { id: string; email: string; name: string };
type AuthCtx = {
	user: User | null;
	/** True only on the very first fetch (no cached data yet). */
	isLoading: boolean;
	/** True when there is no cached session data AND the fetch errored. */
	isError: boolean;
	isAuthenticated: boolean;
	login: (email: string, password: string) => Promise<void>;
	register: (name: string, email: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
	const qc = useQueryClient();

	const {
		data: session,
		isPending,
		isFetching,
		isError,
	} = useQuery({
		queryKey: SESSION_QUERY_KEY,
		queryFn: async () => {
			try {
				return await api<{ session: unknown; user: User | null }>("/api/auth/get-session");
			} catch (err) {
				// 401 = expected "not logged in" response — treat as null session
				if (err instanceof ApiError && err.status === 401) {
					return { session: null, user: null };
				}
				// Any other error (network failure, 500, CORS, etc.) — propagate so
				// TanStack Query sets status:"error" and ProtectedRoute can show a
				// retry UI instead of silently redirecting to login.
				throw err;
			}
		},
		retry: false,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});

	// True only on the very first fetch (no data yet + actively fetching).
	// During background refetches, isPending is false so isLoading stays false.
	const isLoading = isPending && isFetching;

	// Only surface errors when we have NO cached session data.  A background
	// refetch failure (network blip, transient 500) should NOT flash the error
	// UI when we still hold a valid session from the previous successful fetch.
	const surfacedError = isError && !session;

	const login = async (email: string, password: string) => {
		await api("/api/auth/sign-in/email", {
			method: "POST",
			body: { email, password },
		});
		// Cookie is set — refetch get-session as single source of truth
		await qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
	};

	const register = async (name: string, email: string, password: string) => {
		await api("/api/auth/sign-up/email", {
			method: "POST",
			body: { name, email, password },
		});
		await qc.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
	};

	const logout = async () => {
		await api("/api/auth/sign-out", { method: "POST" });
		// Set session to null explicitly (not qc.clear() which causes isPending=true/isFetching=false race)
		qc.setQueryData(SESSION_QUERY_KEY, { session: null, user: null });
		qc.removeQueries({ predicate: (q) => q.queryKey !== SESSION_QUERY_KEY });
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: login/register/logout are stable closures over qc
	const value = useMemo<AuthCtx>(
		() => ({
			user: session?.user ?? null,
			isLoading,
			isError: surfacedError,
			isAuthenticated: !!session?.user,
			login,
			register,
			logout,
		}),
		[session, isLoading, surfacedError],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be inside AuthProvider");
	return ctx;
};
