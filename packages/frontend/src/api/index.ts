/**
 * Barrel file re-exporting Orval-generated hooks with friendly names and
 * custom wrappers that preserve the same interface as the old manual hooks.
 *
 * The generated hooks return { data: { data: T, status, headers } },
 * so wrapper hooks use `select` to unwrap the response body.
 */
import type { WsMessage } from "@bonplan/shared/types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/config/api";
import type {
	getApiFavoritesResponseSuccess,
	getApiNotificationsResponseSuccess,
	getApiSearchesIdListingsListingIdResponseSuccess,
	getApiSearchesIdListingsResponseSuccess,
	getApiSearchesIdResponseSuccess,
	getApiSearchesResponseSuccess,
	getApiSettingsResponseSuccess,
	getApiStatsGoodDealsResponseSuccess,
	getApiStatsResponseSuccess,
} from "./generated/bonPlanAPI";
// ─── Generated query option helpers (for custom wrappers) ───────────
import {
	getApiSearchesIdListings,
	getDeleteApiFavoritesListingIdMutationOptions,
	getDeleteApiSearchesIdMutationOptions,
	getGetApiFavoritesQueryOptions,
	getGetApiNotificationsInfiniteQueryOptions,
	getGetApiSearchesIdListingsInfiniteQueryOptions,
	getGetApiSearchesIdListingsListingIdQueryOptions,
	getGetApiSearchesIdQueryOptions,
	getGetApiSearchesQueryOptions,
	getGetApiSettingsQueryOptions,
	getGetApiStatsGoodDealsQueryOptions,
	getGetApiStatsQueryOptions,
	getPatchApiSearchesIdMutationOptions,
	getPatchApiSettingsMutationOptions,
	getPatchApiSettingsPasswordMutationOptions,
	getPostApiFavoritesListingIdMutationOptions,
	getPostApiSearchesIdTriggerMutationOptions,
	// Mutation option helpers
	getPostApiSearchesMutationOptions,
} from "./generated/bonPlanAPI";

// ─── Generated query key helpers ────────────────────────────────────
export {
	getGetApiFavoritesQueryKey,
	getGetApiNotificationsInfiniteQueryKey,
	getGetApiNotificationsQueryKey,
	getGetApiSearchesIdListingsInfiniteQueryKey,
	getGetApiSearchesIdListingsListingIdQueryKey,
	getGetApiSearchesIdListingsQueryKey,
	getGetApiSearchesIdQueryKey,
	getGetApiSearchesQueryKey,
	getGetApiSettingsQueryKey,
	getGetApiStatsGoodDealsQueryKey,
	getGetApiStatsQueryKey,
} from "./generated/bonPlanAPI";

// ─── Re-export types that components need ───────────────────────────
export type {
	GetApiFavorites200FavoritesItem as FavoriteResponse,
	GetApiNotifications200NotificationsItem as NotificationResponse,
	GetApiNotificationsParams as NotificationsParams,
	GetApiSearches200SearchesItem as SearchResponse,
	GetApiSearchesId200Search as SearchDetailResponse,
	GetApiSearchesId200Stats as SearchStatsResponse,
	GetApiSearchesIdListings200ListingsItem as ListingResponse,
	GetApiSearchesIdListings200ListingsItemAnalysis as ListingAnalysis,
	GetApiSearchesIdListingsListingId200Analysis as ListingDetailAnalysis,
	GetApiSearchesIdListingsListingId200Listing as ListingDetailResponse,
	GetApiSearchesIdListingsParams as ListingsParams,
	GetApiSettings200 as SettingsResponse,
	GetApiStats200 as StatsResponse,
	GetApiStatsGoodDeals200GoodDealsItem as GoodDealResponse,
	PatchApiSearchesIdBody as UpdateSearchBody,
	PatchApiSettingsBody as UpdateSettingsBody,
	PatchApiSettingsPasswordBody as ChangePasswordBody,
	PostApiSearchesBody as CreateSearchBody,
} from "./generated/bonPlanAPI.schemas";

// ─── Query hooks (unwrap .data from Orval response envelope) ────────

/**
 * Helper: customFetch throws on non-2xx, so the response is always the
 * success variant. This casts once so every `select` callback is clean.
 */
const ok = <T>(response: unknown): T => response as T;

export const useSearches = () => {
	const queryOptions = getGetApiSearchesQueryOptions();
	return useQuery({
		...queryOptions,
		select: (response) => ok<getApiSearchesResponseSuccess>(response).data,
	});
};

export const useSearch = (id: string) => {
	const queryOptions = getGetApiSearchesIdQueryOptions(id);
	return useQuery({
		...queryOptions,
		select: (response) => ok<getApiSearchesIdResponseSuccess>(response).data,
	});
};

export const useListings = (searchId: string, params?: { sort?: string; minScore?: number }) => {
	const queryParams = params ? { sort: params.sort, minScore: params.minScore } : undefined;
	const queryOptions = getGetApiSearchesIdListingsInfiniteQueryOptions(
		searchId,
		queryParams as Parameters<typeof getGetApiSearchesIdListingsInfiniteQueryOptions>[1],
	);
	return useInfiniteQuery({
		...queryOptions,
		queryFn: ({ signal, pageParam }) =>
			getApiSearchesIdListings(
				searchId,
				{ ...queryParams, cursor: pageParam || undefined } as Parameters<typeof getApiSearchesIdListings>[1],
				{ signal },
			),
		select: (data) => ({
			...data,
			pages: data.pages.map((page) => ok<getApiSearchesIdListingsResponseSuccess>(page).data),
		}),
		initialPageParam: "" as string,
		getNextPageParam: (lastPage) =>
			ok<getApiSearchesIdListingsResponseSuccess>(lastPage).data.pagination.nextCursor ?? undefined,
	});
};

export const useListing = (searchId: string, listingId: string) => {
	const queryOptions = getGetApiSearchesIdListingsListingIdQueryOptions(searchId, listingId);
	return useQuery({
		...queryOptions,
		select: (response) => ok<getApiSearchesIdListingsListingIdResponseSuccess>(response).data,
	});
};

export const useFavorites = () => {
	const queryOptions = getGetApiFavoritesQueryOptions();
	return useQuery({
		...queryOptions,
		select: (response) => ok<getApiFavoritesResponseSuccess>(response).data,
	});
};

export const useNotifications = (params?: { status?: string; channel?: string }) => {
	const queryParams = params as Parameters<typeof getGetApiNotificationsInfiniteQueryOptions>[0];
	const queryOptions = getGetApiNotificationsInfiniteQueryOptions(queryParams);
	return useInfiniteQuery({
		...queryOptions,
		select: (data) => ({
			...data,
			pages: data.pages.map((page) => ok<getApiNotificationsResponseSuccess>(page).data),
		}),
		initialPageParam: "" as string,
		getNextPageParam: (lastPage) =>
			ok<getApiNotificationsResponseSuccess>(lastPage).data.pagination.nextCursor ?? undefined,
	});
};

export const useStats = () => {
	const queryOptions = getGetApiStatsQueryOptions();
	return useQuery({
		...queryOptions,
		select: (response) => ok<getApiStatsResponseSuccess>(response).data,
	});
};

export const useGoodDeals = () => {
	const queryOptions = getGetApiStatsGoodDealsQueryOptions();
	return useQuery({
		...queryOptions,
		select: (response) => ok<getApiStatsGoodDealsResponseSuccess>(response).data,
	});
};

export const useSettings = () => {
	const queryOptions = getGetApiSettingsQueryOptions();
	return useQuery({
		...queryOptions,
		select: (response) => ok<getApiSettingsResponseSuccess>(response).data,
	});
};

// Feed: reads from React Query cache (populated by WebSocketProvider)
// NOT an API endpoint — cannot be generated by Orval
export const FEED_QUERY_KEY = ["feed"] as const;
export const useFeed = () =>
	useQuery<WsMessage[]>({ queryKey: FEED_QUERY_KEY, queryFn: () => [], staleTime: Number.POSITIVE_INFINITY });

// ─── Mutation hooks (with side-effects: toast, invalidation, optimistic updates) ─

export const useCreateSearch = () => {
	const qc = useQueryClient();
	const mutationOptions = getPostApiSearchesMutationOptions();
	return useMutation({
		...mutationOptions,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: getGetApiSearchesQueryOptions().queryKey });
			toast.success("Recherche créée");
		},
		onError: (err) => {
			if (err instanceof ApiError && err.code === "api_key_required") {
				toast.error("Clé API requise. Configurez-la dans les paramètres.");
			} else {
				toast.error("Échec de la création");
			}
		},
	});
};

export const useUpdateSearch = () => {
	const qc = useQueryClient();
	const mutationOptions = getPatchApiSearchesIdMutationOptions();
	return useMutation({
		...mutationOptions,
		onMutate: async (vars) => {
			const { id, data } = vars;
			if (!data.status) return;
			const queryKey = getGetApiSearchesQueryOptions().queryKey;
			await qc.cancelQueries({ queryKey });
			const prev = qc.getQueryData(queryKey);
			qc.setQueryData(queryKey, (old) => {
				if (!old) return old;
				const o = old as getApiSearchesResponseSuccess;
				return {
					...o,
					data: {
						...o.data,
						searches: o.data.searches.map((s: { id: string; status: string }) =>
							s.id === id ? { ...s, status: data.status } : s,
						),
					},
				} as typeof o;
			});
			return { prev };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.prev) qc.setQueryData(getGetApiSearchesQueryOptions().queryKey, ctx.prev);
			toast.error("Échec de la mise à jour");
		},
		onSettled: () => qc.invalidateQueries({ queryKey: getGetApiSearchesQueryOptions().queryKey }),
	});
};

export const useDeleteSearch = () => {
	const qc = useQueryClient();
	const mutationOptions = getDeleteApiSearchesIdMutationOptions();
	return useMutation({
		...mutationOptions,
		onMutate: async (vars) => {
			const queryKey = getGetApiSearchesQueryOptions().queryKey;
			await qc.cancelQueries({ queryKey });
			const prev = qc.getQueryData(queryKey);
			qc.setQueryData(queryKey, (old) => {
				if (!old) return old;
				const o = old as getApiSearchesResponseSuccess;
				return {
					...o,
					data: {
						...o.data,
						searches: o.data.searches.filter((s: { id: string }) => s.id !== vars.id),
					},
				} as typeof o;
			});
			return { prev };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.prev) qc.setQueryData(getGetApiSearchesQueryOptions().queryKey, ctx.prev);
			toast.error("Échec de la suppression");
		},
		onSuccess: () => toast.success("Recherche supprimée"),
		onSettled: () => qc.invalidateQueries({ queryKey: getGetApiSearchesQueryOptions().queryKey }),
	});
};

export const useTriggerSearch = () => {
	const mutationOptions = getPostApiSearchesIdTriggerMutationOptions();
	return useMutation({
		...mutationOptions,
		onSuccess: () => toast.success("Scrape déclenché"),
		onError: (err) => {
			if (err instanceof ApiError && err.code === "api_key_required") {
				toast.error("Clé API requise.");
			} else if (err instanceof ApiError && err.code === "rate_limit_exceeded") {
				toast.error("Limite atteinte. Réessayez dans 5 minutes.");
			} else {
				toast.error("Échec du déclenchement");
			}
		},
	});
};

export const useToggleFavorite = () => {
	const qc = useQueryClient();
	const addOptions = getPostApiFavoritesListingIdMutationOptions();
	const removeOptions = getDeleteApiFavoritesListingIdMutationOptions();
	return useMutation({
		mutationFn: async ({ listingId, add }: { listingId: string; add: boolean }, context) => {
			if (add) {
				return addOptions.mutationFn?.({ listingId }, context);
			}
			return removeOptions.mutationFn?.({ listingId }, context);
		},
		onMutate: async () => {
			const queryKey = getGetApiFavoritesQueryOptions().queryKey;
			await qc.cancelQueries({ queryKey });
			const prev = qc.getQueryData(queryKey);
			return { prev };
		},
		onError: (_err, _vars, ctx) => {
			if (ctx?.prev) qc.setQueryData(getGetApiFavoritesQueryOptions().queryKey, ctx.prev);
		},
		onSettled: () => qc.invalidateQueries({ queryKey: getGetApiFavoritesQueryOptions().queryKey }),
	});
};

export const useUpdateSettings = () => {
	const qc = useQueryClient();
	const mutationOptions = getPatchApiSettingsMutationOptions();
	return useMutation({
		...mutationOptions,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: getGetApiSettingsQueryOptions().queryKey });
			toast.success("Paramètres mis à jour");
		},
	});
};

export const useChangePassword = () => {
	const mutationOptions = getPatchApiSettingsPasswordMutationOptions();
	return useMutation({
		...mutationOptions,
		onSuccess: () => toast.success("Mot de passe modifié"),
	});
};
