import { Building2Icon, HeartIcon, UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToggleFavorite } from "@/api";
import { getDealBarColor, ScoreBar, ScoreCircle } from "@/components/ScoreBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Listing = {
	id: string;
	title: string;
	price: number;
	url: string;
	images: string[];
	sellerType: string;
	location: string;
	createdAt?: string;
};

export type ListingCardAnalysis = {
	score?: number | null;
	verdict?: string | null;
	[key: string]: unknown;
};

interface ListingCardProps {
	listing: Listing;
	analysis?: ListingCardAnalysis | null;
	searchId: string;
	isFavorite?: boolean;
	selectable?: boolean;
	selected?: boolean;
	onSelect?: (id: string) => void;
	selectDisabled?: boolean;
}

const formatPrice = (cents: number): string => {
	const euros = cents / 100;
	return new Intl.NumberFormat("fr-FR", {
		style: "currency",
		currency: "EUR",
		minimumFractionDigits: euros % 1 === 0 ? 0 : 2,
		maximumFractionDigits: 2,
	}).format(euros);
};

const formatRelativeTime = (dateStr: string): string => {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "À l'instant";
	if (mins < 60) return `il y a ${mins} min`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `il y a ${hours} h`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `il y a ${days} j`;
	const months = Math.floor(days / 30);
	return `il y a ${months} mois`;
};

const sellerTypeConfig: Record<string, { label: string; icon: typeof UserIcon }> = {
	particulier: { label: "Particulier", icon: UserIcon },
	pro: { label: "Pro", icon: Building2Icon },
};

export const ListingCard = ({
	listing,
	analysis,
	searchId,
	isFavorite = false,
	selectable = false,
	selected = false,
	onSelect,
	selectDisabled = false,
}: ListingCardProps) => {
	const navigate = useNavigate();
	const toggleFavorite = useToggleFavorite();

	const score = analysis?.score ?? null;
	const thumbnail = listing.images[0];
	const dealBarColor = getDealBarColor(score);
	const sellerConf = sellerTypeConfig[listing.sellerType];

	const handleCardClick = () => {
		navigate(`/searches/${searchId}/listings/${listing.id}`);
	};

	const handleFavoriteClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		toggleFavorite.mutate({ listingId: listing.id, add: !isFavorite });
	};

	const handleSelectClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!selectDisabled || selected) {
			onSelect?.(listing.id);
		}
	};

	return (
		<Card
			className="cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:shadow-lg overflow-hidden"
			onClick={handleCardClick}
		>
			{/* Deal quality top bar */}
			{dealBarColor && <div className={cn("h-1 w-full", dealBarColor)} />}

			{/* Image with score overlay */}
			{thumbnail && (
				<div className="relative">
					{selectable && (
						<button
							type="button"
							onClick={handleSelectClick}
							className={cn(
								"absolute top-2 left-2 z-10 flex size-5 items-center justify-center rounded border-2 transition-colors",
								selected
									? "border-primary bg-primary text-primary-foreground"
									: selectDisabled
										? "border-muted-foreground/30 bg-muted/50 cursor-not-allowed"
										: "border-muted-foreground/50 bg-background/80 hover:border-primary",
							)}
						>
							{selected && (
								<svg viewBox="0 0 16 16" fill="currentColor" className="size-3">
									<path d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z" />
								</svg>
							)}
						</button>
					)}
					<img src={thumbnail} alt={listing.title} className="h-40 w-full object-cover" />
					{score !== null && (
						<div className="absolute top-2 right-2">
							<ScoreCircle score={score} />
						</div>
					)}
				</div>
			)}

			{selectable && !thumbnail && (
				<div className="flex justify-end px-3 pt-2">
					<button
						type="button"
						onClick={handleSelectClick}
						className={cn(
							"flex size-5 items-center justify-center rounded border-2 transition-colors",
							selected
								? "border-primary bg-primary text-primary-foreground"
								: selectDisabled
									? "border-muted-foreground/30 bg-muted/50 cursor-not-allowed"
									: "border-muted-foreground/50 bg-background/80 hover:border-primary",
						)}
					>
						{selected && (
							<svg viewBox="0 0 16 16" fill="currentColor" className="size-3">
								<path d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z" />
							</svg>
						)}
					</button>
				</div>
			)}

			<CardContent className="flex flex-col gap-2 pt-3">
				<div className="flex items-start justify-between gap-2">
					<h3 className="line-clamp-2 text-sm font-medium leading-snug">{listing.title}</h3>
					<Button
						size="icon-sm"
						variant="ghost"
						onClick={handleFavoriteClick}
						className="shrink-0"
						title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
						aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
					>
						<HeartIcon className={cn("size-4", isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground")} />
					</Button>
				</div>

				{/* Price — prominent */}
				<p className="text-lg font-bold tracking-tight">{formatPrice(listing.price)}</p>

				<ScoreBar score={score} />

				<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
					<span className="truncate">{listing.location}</span>

					{/* Seller type with icon */}
					{sellerConf && (
						<span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
							<sellerConf.icon className="size-3" />
							{sellerConf.label}
						</span>
					)}
					{!sellerConf && (
						<span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
							{listing.sellerType}
						</span>
					)}
				</div>

				{/* Relative time */}
				{listing.createdAt && (
					<span className="text-xs text-muted-foreground/70">{formatRelativeTime(listing.createdAt)}</span>
				)}
			</CardContent>
		</Card>
	);
};
