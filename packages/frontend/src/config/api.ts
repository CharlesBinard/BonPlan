import type { QueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

let _queryClient: QueryClient | null = null;
/** Called once from AppProviders to wire up the 401 handler */
export const setApiQueryClient = (qc: QueryClient) => {
	_queryClient = qc;
};

export class ApiError extends Error {
	status: number;
	data: Record<string, unknown>;

	constructor(status: number, data: Record<string, unknown>) {
		super(`API Error ${status}`);
		this.status = status;
		this.data = data;
	}

	get code(): string {
		return typeof this.data.error === "string" ? this.data.error : "unknown_error";
	}
}

type ApiOptions = { method?: string; body?: unknown };

export const api = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
	const headers: Record<string, string> = {};
	if (options.body) headers["Content-Type"] = "application/json";

	const response = await fetch(`${BASE_URL}${path}`, {
		method: options.method ?? "GET",
		headers,
		body: options.body ? JSON.stringify(options.body) : undefined,
		credentials: "include",
	});

	if (!response.ok) {
		const data = await response.json().catch(() => ({ error: "unknown_error" }));
		// Session expired — clear cached session so auth state updates
		// Skip auth endpoints (login/register return 401 for wrong credentials)
		if (response.status === 401 && _queryClient && !path.startsWith("/api/auth/")) {
			_queryClient.setQueryData(["auth", "session"], { session: null, user: null });
		}
		throw new ApiError(response.status, data as Record<string, unknown>);
	}

	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
};
