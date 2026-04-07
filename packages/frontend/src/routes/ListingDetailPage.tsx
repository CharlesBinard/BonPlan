import {
	AlertTriangleIcon,
	ArrowLeftIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	ExternalLinkIcon,
	GitCompareArrows,
	HeartIcon,
	ImageIcon,
	Loader2Icon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type ListingDetailAnalysis, useListing, useListings, useToggleFavorite } from "@/api";
import { ScoreBar, ScoreCircle } from "@/components/ScoreBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/constants/routes";
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
	const [compareSheetOpen, setCompareSheetOpen] = useState(false);
	const [compareIds, setCompareIds] = useState<Set<string>>(new Set());

	const {
		data: listingsData,
		fetchNextPage: fetchMoreListings,
		hasNextPage: hasMoreListings,
		isFetchingNextPage: isFetchingMoreListings,
	} = useListings(searchId, { sort: "score_desc" });

	const otherListings = (listingsData?.pages.flatMap((p) => p.listings) ?? []).filter((l) => l.id !== listingId);

	const handleCompareSelect = (lid: string) => {
		setCompareIds((prev) => {
			const next = new Set(prev);
			if (next.has(lid)) {
				next.delete(lid);
			} else if (next.size < 3) {
				next.add(lid);
			}
			return next;
		});
	};

	const openCompareSheet = () => {
		setCompareIds(new Set());
		setCompareSheetOpen(true);
	};

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
									key={img}
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
				{analysis?.imageAnalysis && (
					<p className="text-xs text-muted-foreground">
						Score ajusté par l'analyse d'images (original: {analysis.imageAnalysis.originalScore})
					</p>
				)}
				{analysis?.verdict && <p className="font-semibold whitespace-pre-line">{analysis.verdict}</p>}
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
					{reasoningExpanded && (
						<p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">{analysis.reasoning}</p>
					)}
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
				<div className="flex flex-col gap-1.5">
					<h2 className="flex items-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400">
						<AlertTriangleIcon className="size-3.5" />
						Points d'attention
					</h2>
					<div className="flex flex-wrap gap-1.5">
						{analysis.redFlags.map((flag) => (
							<span
								key={flag}
								className="inline-flex items-center gap-1 rounded-full border border-red-200/60 px-2.5 py-0.5 text-xs text-red-600 dark:border-red-800/40 dark:text-red-300"
							>
								{flag}
							</span>
						))}
					</div>
				</div>
			)}

			{/* Image Analysis */}
			{analysis?.imageAnalysis && (
				<div className="flex flex-col gap-2">
					<h2 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
						<ImageIcon className="size-3.5" />
						Analyse des images
						{analysis.imageAnalysis.scoreAdjustment !== 0 && (
							<Badge
								variant={analysis.imageAnalysis.scoreAdjustment > 0 ? "default" : "destructive"}
								className="ml-1 text-[10px]"
							>
								{analysis.imageAnalysis.scoreAdjustment > 0 ? "+" : ""}
								{analysis.imageAnalysis.scoreAdjustment}
							</Badge>
						)}
					</h2>
					<p className="text-sm text-muted-foreground">{analysis.imageAnalysis.condition}</p>
					{analysis.imageAnalysis.findings.length > 0 && (
						<ul className="space-y-1">
							{analysis.imageAnalysis.findings.map((finding: string) => (
								<li key={finding} className="text-sm flex items-start gap-1.5">
									<span className="text-muted-foreground mt-0.5">•</span>
									<span>{finding}</span>
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			<Separator />

			{/* Action buttons */}
			<div className="flex gap-2">
				<a href={listing.url} target="_blank" rel="noopener noreferrer" className="flex-1">
					<Button className="w-full" variant="default">
						<ExternalLinkIcon />
						Voir sur Leboncoin
					</Button>
				</a>
				<Button variant="outline" onClick={openCompareSheet}>
					<GitCompareArrows className="size-4" />
					Comparer avec...
				</Button>
			</div>

			{/* Compare picker sheet */}
			<Sheet open={compareSheetOpen} onOpenChange={setCompareSheetOpen}>
				<SheetContent side="right" className="flex flex-col">
					<SheetHeader>
						<SheetTitle>Choisir des annonces à comparer</SheetTitle>
					</SheetHeader>
					<div className="flex-1 overflow-y-auto">
						<div className="flex flex-col gap-1 py-2">
							{otherListings.map((item) => {
								const isSelected = compareIds.has(item.id);
								const isDisabled = compareIds.size >= 3 && !isSelected;
								const itemScore = item.analysis?.score ?? null;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => !isDisabled && handleCompareSelect(item.id)}
										className={cn(
											"flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
											isSelected
												? "bg-primary/10 border border-primary/30"
												: isDisabled
													? "opacity-50 cursor-not-allowed"
													: "hover:bg-muted",
										)}
									>
										<div
											className={cn(
												"flex size-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
												isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
											)}
										>
											{isSelected && (
												<svg viewBox="0 0 16 16" fill="currentColor" className="size-3" aria-hidden="true">
													<title>Sélectionné</title>
													<path d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z" />
												</svg>
											)}
										</div>
										{item.images[0] ? (
											<img src={item.images[0]} alt="" className="size-10 shrink-0 rounded object-cover" />
										) : (
											<div className="size-10 shrink-0 rounded bg-muted" />
										)}
										<div className="flex-1 min-w-0">
											<p className="truncate text-sm font-medium">{item.title}</p>
											<p className="text-xs text-muted-foreground">
												{new Intl.NumberFormat("fr-FR", {
													style: "currency",
													currency: "EUR",
													minimumFractionDigits: 0,
												}).format(item.price / 100)}
											</p>
										</div>
										{itemScore !== null && <ScoreCircle score={itemScore} />}
									</button>
								);
							})}
							{otherListings.length === 0 && !hasMoreListings && (
								<p className="text-sm text-muted-foreground text-center py-8">
									Aucune autre annonce disponible pour comparer.
								</p>
							)}
							{hasMoreListings && (
								<Button
									variant="ghost"
									size="sm"
									className="mx-auto"
									onClick={() => fetchMoreListings()}
									disabled={isFetchingMoreListings}
								>
									{isFetchingMoreListings ? <Loader2Icon className="animate-spin size-4" /> : "Charger plus..."}
								</Button>
							)}
						</div>
					</div>
					<SheetFooter className="border-t pt-3">
						<Button
							className="w-full"
							disabled={compareIds.size === 0}
							onClick={() => {
								const ids = [listingId, ...compareIds].join(",");
								navigate(`${routes.searchCompare(searchId)}?ids=${ids}`);
							}}
						>
							<GitCompareArrows className="size-4" />
							Comparer ({compareIds.size + 1})
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>
		</div>
	);
};

export const Component = ListingDetailPage;
