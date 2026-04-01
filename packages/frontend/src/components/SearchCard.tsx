import { SearchStatus } from "@bonplan/shared/types";
import { ClockIcon, Loader2Icon, PauseIcon, PlayIcon, TrashIcon, ZapIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDeleteSearch, useTriggerSearch, useUpdateSearch } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { statusBorderColors, statusColors, statusDotColors, statusLabels } from "@/constants/search-status";
import { cn } from "@/lib/utils";

type Search = {
	id: string;
	query: string;
	status: string;
	location: string;
	intervalMin: number;
	lastScrapedAt: string | null;
	minScore: number;
	aiContext: unknown;
};

interface SearchCardProps {
	search: Search;
	listingCount?: number;
}

const formatRelativeTime = (dateStr: string | null, status?: string): string => {
	if (!dateStr) {
		if (status === SearchStatus.Pending) return "Initialisation…";
		if (status === SearchStatus.Mapping) return "Analyse des mots-clés…";
		if (status === SearchStatus.Active) return "Premier scan en cours…";
		return "Jamais";
	}
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "À l'instant";
	if (mins < 60) return `il y a ${mins} min`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `il y a ${hours} h`;
	const days = Math.floor(hours / 24);
	return `il y a ${days} j`;
};

export const SearchCard = ({ search, listingCount }: SearchCardProps) => {
	const navigate = useNavigate();
	const trigger = useTriggerSearch();
	const update = useUpdateSearch();
	const del = useDeleteSearch();

	const isActive = search.status === SearchStatus.Active;
	const canPauseResume = search.status === SearchStatus.Active || search.status === SearchStatus.Paused;

	return (
		<Card
			className={cn(
				"cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:shadow-lg",
				"border-l-4",
				statusBorderColors[search.status] ?? "border-l-muted",
			)}
			onClick={() => navigate(`/searches/${search.id}`)}
		>
			<CardHeader>
				<div className="flex items-start justify-between gap-2">
					<CardTitle className="line-clamp-2">{search.query}</CardTitle>
					<Badge
						className={cn(
							"shrink-0 border-0 px-3 py-0.5 text-sm font-semibold",
							statusColors[search.status] ?? "bg-muted text-muted-foreground",
						)}
					>
						{isActive && (
							<span className="relative mr-1.5 flex size-2">
								<span
									className={cn(
										"absolute inline-flex size-full animate-ping rounded-full opacity-75",
										statusDotColors[search.status],
									)}
								/>
								<span className={cn("relative inline-flex size-2 rounded-full", statusDotColors[search.status])} />
							</span>
						)}
						{statusLabels[search.status] ?? search.status}
					</Badge>
				</div>
				<CardDescription>{search.location || "Toute la France"}</CardDescription>
			</CardHeader>
			<CardContent>
				<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
					<dt className="text-muted-foreground">Intervalle</dt>
					<dd>{search.intervalMin} min</dd>
					{listingCount !== undefined && (
						<>
							<dt className="text-muted-foreground">Annonces</dt>
							<dd>{listingCount}</dd>
						</>
					)}
				</dl>

				{/* Last scraped — prominent display */}
				<div className="mt-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
					<ClockIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="text-muted-foreground">Dernier scan</span>
					<span className="ml-auto font-medium">{formatRelativeTime(search.lastScrapedAt, search.status)}</span>
				</div>
			</CardContent>
			<CardFooter className="gap-1.5" onClick={(e) => e.stopPropagation()}>
				<Button
					size="icon-sm"
					variant="outline"
					onClick={() => trigger.mutate({ id: search.id })}
					disabled={trigger.isPending}
					title="Déclencher un scan"
					aria-label="Déclencher un scan"
				>
					{trigger.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <ZapIcon className="size-3.5" />}
				</Button>
				{canPauseResume && (
					<Button
						size="icon-sm"
						variant="outline"
						onClick={() =>
							update.mutate({
								id: search.id,
								data: { status: isActive ? SearchStatus.Paused : SearchStatus.Active },
							})
						}
						disabled={update.isPending}
						title={isActive ? "Mettre en pause" : "Reprendre"}
						aria-label={isActive ? "Mettre en pause" : "Reprendre"}
					>
						{update.isPending ? (
							<Loader2Icon className="size-3.5 animate-spin" />
						) : isActive ? (
							<PauseIcon className="size-3.5" />
						) : (
							<PlayIcon className="size-3.5" />
						)}
					</Button>
				)}
				<Button
					size="icon-sm"
					variant="destructive"
					onClick={() => del.mutate({ id: search.id })}
					disabled={del.isPending}
					title="Supprimer"
					aria-label="Supprimer la recherche"
					className="ml-auto"
				>
					{del.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <TrashIcon className="size-3.5" />}
				</Button>
			</CardFooter>
		</Card>
	);
};
