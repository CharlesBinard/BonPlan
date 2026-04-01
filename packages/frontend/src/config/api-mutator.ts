import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

let _queryClient: QueryClient | null = null;
/** Called once from AppProviders to wire up the 401 handler */
export const setApiQueryClient = (qc: QueryClient) => {
	_queryClient = qc;
};

/**
 * Custom fetch mutator for Orval-generated hooks.
 * Returns { data, status, headers } to match the generated response types.
 */
export const customFetch = async <T>(url: string, init?: RequestInit): Promise<T> => {
	const response = await fetch(`${BASE_URL}${url}`, {
		...init,
		credentials: "include",
	});

	if (!response.ok) {
		// Session expired — clear cached session so auth state updates
		if (response.status === 401 && _queryClient && !url.startsWith("/api/auth/")) {
			_queryClient.setQueryData(["auth", "session"], { session: null, user: null });
		}
		const errorBody = await response.json().catch(() => ({ error: "unknown_error" }));
		throw new ApiError(response.status, errorBody as Record<string, unknown>);
	}

	const data = response.status === 204 ? undefined : await response.json();

	return { data, status: response.status, headers: response.headers } as T;
};

export default customFetch;
