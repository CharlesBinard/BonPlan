import { getScoreBand, ScoreBand } from "@bonplan/shared/types";
import { cn } from "@/lib/utils";

interface ScoreBarProps {
	score: number | null;
}

const bandGradientColors: Record<ScoreBand, string> = {
	[ScoreBand.Exceptional]: "from-green-500 to-emerald-400",
	[ScoreBand.Good]: "from-emerald-500 to-green-400",
	[ScoreBand.Fair]: "from-yellow-500 to-amber-400",
	[ScoreBand.Overpriced]: "from-orange-500 to-amber-500",
	[ScoreBand.Poor]: "from-red-500 to-orange-500",
};

const bandTextColors: Record<ScoreBand, string> = {
	[ScoreBand.Exceptional]: "text-emerald-400",
	[ScoreBand.Good]: "text-green-400",
	[ScoreBand.Fair]: "text-yellow-400",
	[ScoreBand.Overpriced]: "text-orange-400",
	[ScoreBand.Poor]: "text-red-400",
};

const bandLabels: Record<ScoreBand, string> = {
	[ScoreBand.Exceptional]: "Affaire exceptionnelle",
	[ScoreBand.Good]: "Bonne affaire",
	[ScoreBand.Fair]: "Prix correct",
	[ScoreBand.Overpriced]: "Surpayé",
	[ScoreBand.Poor]: "Mauvaise affaire",
};

export const ScoreBar = ({ score }: ScoreBarProps) => {
	if (score === null) {
		return (
			<div className="flex items-center gap-2">
				<span className="text-xs text-muted-foreground italic">En attente d'analyse</span>
			</div>
		);
	}

	const band = getScoreBand(score);
	const gradient = bandGradientColors[band];
	const textColor = bandTextColors[band];
	const label = bandLabels[band];

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-2">
				<span className={cn("text-xs font-medium", textColor)}>{label}</span>
				<span className={cn("text-sm font-bold font-mono tabular-nums", textColor)}>{score}</span>
			</div>
			<div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
				<div
					className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", gradient)}
					style={{ width: `${Math.max(score, 2)}%` }}
				/>
			</div>
		</div>
	);
};

/**
 * Compact circular score indicator for overlaying on images.
 */
export const ScoreCircle = ({ score }: { score: number }) => {
	const band = getScoreBand(score);
	const textColor = bandTextColors[band];
	const gradient = bandGradientColors[band];

	return (
		<div
			className={cn(
				"flex size-9 items-center justify-center rounded-full",
				"bg-black/70 backdrop-blur-sm ring-1 ring-white/10",
			)}
			title={`Score : ${score}/100`}
		>
			<div className={cn("absolute inset-0 rounded-full opacity-30 bg-gradient-to-br", gradient)} />
			<span className={cn("relative text-xs font-bold font-mono tabular-nums", textColor)}>{score}</span>
		</div>
	);
};

/**
 * Returns a top-bar color class based on score for deal quality indication.
 */
export const getDealBarColor = (score: number | null | undefined): string | null => {
	if (score == null) return null;
	const band = getScoreBand(score);
	const barColors: Record<ScoreBand, string> = {
		[ScoreBand.Exceptional]: "bg-emerald-500",
		[ScoreBand.Good]: "bg-green-500",
		[ScoreBand.Fair]: "bg-yellow-500",
		[ScoreBand.Overpriced]: "bg-orange-500",
		[ScoreBand.Poor]: "bg-red-500",
	};
	return barColors[band];
};
