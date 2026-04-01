import { ScoreBand } from "@bonplan/shared/types";

export const scoreColors: Record<ScoreBand, string> = {
	[ScoreBand.Exceptional]: "text-green-600 bg-green-100",
	[ScoreBand.Good]: "text-blue-600 bg-blue-100",
	[ScoreBand.Fair]: "text-yellow-600 bg-yellow-100",
	[ScoreBand.Overpriced]: "text-orange-600 bg-orange-100",
	[ScoreBand.Poor]: "text-red-600 bg-red-100",
};

export const scoreLabels: Record<ScoreBand, string> = {
	[ScoreBand.Exceptional]: "Affaire exceptionnelle",
	[ScoreBand.Good]: "Bonne affaire",
	[ScoreBand.Fair]: "Prix correct",
	[ScoreBand.Overpriced]: "Surpayé",
	[ScoreBand.Poor]: "Mauvaise affaire",
};
