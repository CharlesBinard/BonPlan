import {
	AlertTriangleIcon,
	ArrowLeftIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	ExternalLinkIcon,
	HeartIcon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type ListingDetailAnalysis, useListing, useToggleFavorite } from "@/api";
import { ScoreBar } from "@/components/ScoreBar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const formatPrice = (cents: number): string => `${(cents / 100).toFixed(2)} €`;

const ListingDetailPage = () => {
	const { id: searchId = "", listingId = "" } = useParams<{ id: string; listingId: string }>();
	const navigate = useNavigate();
	const toggleFavorite = useToggleFavorite();

	const { data, isLoading } = useListing(searchId, listingId);
	const [isFavorite, setIsFavorite] = useState(false);
	const [reasoningExpanded, setReasoningExpanded] = useState(false);
	const [currentImage, setCurrentImage] = useState(0);

	const listing = data?.listing;
	const analysis: ListingDetailAnalysis | null | undefined = data?.analysis;

	const handleFavoriteToggle = () => {
		const next = !isFavorite;
		setIsFavorite(next);
		toggleFavorite.mutate({ listingId, add: next });
	};

	if (isLoading) {
		return (
			<div className="flex flex-col gap-6">
				<Skeleton className="h-6 w-32" />
				<Skeleton className="h-64 w-full rounded-xl" />
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-6 w-24" />
				<Skeleton className="h-20 w-full" />
			</div>
		);
	}

	if (!listing) {
		return (
			<div className="flex flex-col gap-4">
				<Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-1 w-fit" aria-label="Retour">
					<ArrowLeftIcon />
					Retour
				</Button>
				<p className="text-muted-foreground">Annonce introuvable.</p>
			</div>
		);
	}

	const hasMarketRange = analysis?.marketPriceLow != null && analysis?.marketPriceHigh != null;

	return (
		<div className="flex flex-col gap-6 pb-8 animate-fade-in">
			{/* Back */}
			<Button
				variant="ghost"
				size="sm"
				onClick={() => navigate(`/searches/${searchId}`)}
				className="-ml-1 w-fit"
				aria-label="Retour aux annonces"
			>
				<ArrowLeftIcon />
				Retour aux annonces
			</Button>

			{/* Images */}
			{listing.images.length > 0 && (
				<div className="flex flex-col gap-3">
					<div className="overflow-hidden rounded-xl bg-muted">
						<img
							src={listing.images[currentImage]}
							alt={listing.title}
							className="h-80 w-full object-contain sm:h-96"
						/>
					</div>
					{listing.images.length > 1 && (
						<div className="flex gap-2 overflow-x-auto pb-1">
							{listing.images.map((img, i) => (
								<button
									type="button"
									// biome-ignore lint/suspicious/noArrayIndexKey: image thumbnails have no stable id
									key={i}
									onClick={() => setCurrentImage(i)}
									aria-label={`Image ${i + 1}`}
									className={cn(
										"shrink-0 overflow-hidden rounded-lg border-2 transition-all",
										i === currentImage
											? "border-primary ring-2 ring-primary/20"
											: "border-transparent opacity-70 hover:opacity-100",
									)}
								>
									<img src={img} alt="" className="h-20 w-20 object-cover" />
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{/* Title + price + favorite */}
			<div className="flex items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="text-xl font-semibold leading-snug">{listing.title}</h1>
					<p className="text-2xl font-bold text-primary">{formatPrice(listing.price)}</p>
					<p className="text-sm text-muted-foreground">{listing.location}</p>
				</div>
				<Button
					size="icon"
					variant="ghost"
					onClick={handleFavoriteToggle}
					title={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
					aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
				>
					<HeartIcon className={cn("size-5", isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground")} />
				</Button>
			</div>

			<Separator />

			{/* Score */}
			<div className="flex flex-col gap-2">
				<h2 className="text-sm font-medium text-muted-foreground">Analyse</h2>
				<ScoreBar score={analysis?.score ?? null} />

				{analysis?.verdict && <p className="font-semibold">{analysis.verdict}</p>}
			</div>

			{/* Reasoning (expandable) */}
			{analysis?.reasoning && (
				<div className="flex flex-col gap-2">
					<button
						type="button"
						onClick={() => setReasoningExpanded((v) => !v)}
						className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
					>
						{reasoningExpanded ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
						Raisonnement
					</button>
					{reasoningExpanded && <p className="text-sm leading-relaxed text-muted-foreground">{analysis.reasoning}</p>}
				</div>
			)}

			{/* Market price range */}
			{hasMarketRange && (
				<div className="flex flex-col gap-3">
					<h2 className="text-sm font-medium text-muted-foreground">Prix du marché</h2>
					{(() => {
						const low = analysis?.marketPriceLow ?? 0;
						const high = analysis?.marketPriceHigh ?? 0;
						const range = high - low;
						const pct = range > 0 ? Math.min(100, Math.max(0, ((listing.price - low) / range) * 100)) : 50;
						return (
							<div className="flex flex-col gap-2">
								<div className="flex items-end gap-3">
									<div className="flex flex-col items-start gap-0.5">
										<span className="text-xs text-muted-foreground">Bas</span>
										<span className="text-sm font-semibold text-green-600">{formatPrice(low)}</span>
									</div>
									<div className="relative flex-1 py-3">
										<div className="h-3 rounded-full bg-gradient-to-r from-green-400 via-yellow-300 to-red-400 shadow-inner" />
										<div
											className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
											style={{ left: `calc(${pct}% - 8px)` }}
										>
											<div className="mb-0.5 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-background whitespace-nowrap">
												{formatPrice(listing.price)}
											</div>
											<div className="size-4 rounded-full border-[3px] border-background bg-foreground shadow-md" />
										</div>
									</div>
									<div className="flex flex-col items-end gap-0.5">
										<span className="text-xs text-muted-foreground">Haut</span>
										<span className="text-sm font-semibold text-red-600">{formatPrice(high)}</span>
									</div>
								</div>
							</div>
						);
					})()}
				</div>
			)}

			{/* Red flags */}
			{analysis?.redFlags && analysis.redFlags.length > 0 && (
				<div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/30 dark:bg-red-950/20">
					<h2 className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400">
						<AlertTriangleIcon className="size-4" />
						Points d'attention
					</h2>
					<ul className="flex flex-col gap-2">
						{analysis.redFlags.map((flag, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: red flags are static strings without stable IDs
							<li key={i} className="flex items-start gap-2.5 text-sm">
								<AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-red-500 dark:text-red-400" />
								<span className="text-red-900 dark:text-red-200">{flag}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			<Separator />

			{/* External link */}
			<a href={listing.url} target="_blank" rel="noopener noreferrer">
				<Button className="w-full" variant="default">
					<ExternalLinkIcon />
					Voir sur Leboncoin
				</Button>
			</a>
		</div>
	);
};

export const Component = ListingDetailPage;
