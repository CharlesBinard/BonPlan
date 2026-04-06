import type { GeocodedLocation } from "@bonplan/shared";

export type LbcUrlParams = {
	text: string;
	location?: GeocodedLocation | null;
	radiusKm?: number;
};

export function buildLbcSearchUrl(params: LbcUrlParams): string {
	const url = new URL("https://www.leboncoin.fr/recherche");

	url.searchParams.set("text", params.text);

	if (params.location && params.radiusKm) {
		const { city, postcode, latitude, longitude } = params.location;
		const radiusMeters = params.radiusKm * 1000;
		url.searchParams.set("locations", `${city}_${postcode}__${latitude}_${longitude}_0_${radiusMeters}`);
	}

	url.searchParams.set("sort", "time");
	url.searchParams.set("order", "desc");
	url.searchParams.set("transaction_status", "search__no_value");

	return url.toString();
}

export function buildLbcSearchUrls(
	keywordVariations: string[],
	location: GeocodedLocation | null,
	radiusKm: number,
): string[] {
	return keywordVariations.map((text) => buildLbcSearchUrl({ text, location, radiusKm }));
}
