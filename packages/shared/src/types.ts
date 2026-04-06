export enum SellerType {
	Pro = "pro",
	Particulier = "particulier",
}

export enum NotificationChannel {
	Webhook = "webhook",
	Discord = "discord",
}

export enum NotificationStatus {
	Pending = "pending",
	Sent = "sent",
	Failed = "failed",
}

export enum SearchStatus {
	Pending = "pending",
	Mapping = "mapping",
	Active = "active",
	Paused = "paused",
	Blocked = "blocked",
}

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
	| { type: "image.analysis.complete"; searchId: string; listingId: string; originalScore: number; adjustedScore: number }
	| { type: "notification.sent"; notificationId: string; channel: string; status: string }
	| { type: "auth.expired" };

export type PaginatedResponse<T> = {
	data: T[];
	nextCursor: string | null;
	hasMore: boolean;
};

export enum ScoreBand {
	Exceptional = "exceptional",
	Good = "good",
	Fair = "fair",
	Overpriced = "overpriced",
	Poor = "poor",
}

export const getScoreBand = (score: number): ScoreBand => {
	const clamped = Math.max(0, Math.min(100, score));
	if (clamped >= 90) return ScoreBand.Exceptional;
	if (clamped >= 70) return ScoreBand.Good;
	if (clamped >= 50) return ScoreBand.Fair;
	if (clamped >= 30) return ScoreBand.Overpriced;
	return ScoreBand.Poor;
};

export type GeocodedLocation = {
	city: string;
	postcode: string;
	latitude: number;
	longitude: number;
};
