/**
 * Local re-declaration of @bonplan/shared/types for the frontend.
 * Uses const objects instead of enums to satisfy erasableSyntaxOnly.
 */

export const SellerType = {
	Pro: "pro",
	Particulier: "particulier",
} as const;
export type SellerType = (typeof SellerType)[keyof typeof SellerType];

export const NotificationChannel = {
	Webhook: "webhook",
	Discord: "discord",
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
	Pending: "pending",
	Sent: "sent",
	Failed: "failed",
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const SearchStatus = {
	Pending: "pending",
	Mapping: "mapping",
	Active: "active",
	Paused: "paused",
	Blocked: "blocked",
} as const;
export type SearchStatus = (typeof SearchStatus)[keyof typeof SearchStatus];

export type AiContext = {
	keywordVariations: string[];
	judgmentCriteria: string;
	priceRange: { min: number; max: number } | null;
	confidence: number;
	searchUrls: string[];
};

export type WsMessage =
	| { type: "search.mapped"; searchId: string; aiContext: AiContext }
	| { type: "search.error"; searchId: string; source: string; error: string; errorType: string }
	| { type: "search.blocked"; searchId: string; reason: string; retryAfter: string }
	| { type: "listing.analyzed"; searchId: string; listingId: string; score: number; verdict: string }
	| { type: "notification.sent"; notificationId: string; channel: string; status: string }
	| { type: "auth.expired" };

export type PaginatedResponse<T> = {
	data: T[];
	nextCursor: string | null;
	hasMore: boolean;
};

export const ScoreBand = {
	Exceptional: "exceptional",
	Good: "good",
	Fair: "fair",
	Overpriced: "overpriced",
	Poor: "poor",
} as const;
export type ScoreBand = (typeof ScoreBand)[keyof typeof ScoreBand];

export type GeocodedLocation = {
	city: string;
	postcode: string;
	latitude: number;
	longitude: number;
};

export const getScoreBand = (score: number): ScoreBand => {
	if (score >= 90) return ScoreBand.Exceptional;
	if (score >= 70) return ScoreBand.Good;
	if (score >= 50) return ScoreBand.Fair;
	if (score >= 30) return ScoreBand.Overpriced;
	return ScoreBand.Poor;
};
