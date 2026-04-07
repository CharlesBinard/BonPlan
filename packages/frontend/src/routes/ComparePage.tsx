import { AlertTriangleIcon, ArrowLeftIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useListing } from "@/api";
import { ScoreBar } from "@/components/ScoreBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/constants/routes";
import { cn } from "@/lib/utils";

const formatPrice = (cents: number): string =>
	new Intl.NumberFormat("fr-FR", {
		style: "currency",
		currency: "EUR",
		minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
	}).format(cents / 100);

const sellerLabels: Record<string, string> = {
	particulier: "Particulier",
	pro: "Pro",
};

const ComparePage = () => {
	const { id: searchId = "" } = useParams<{ id: string }>();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	const ids = useMemo(() => {
		const raw = searchParams.get("ids") ?? "";
		return [
			...new Set(
				raw
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			),
		].slice(0, 4);
	}, [searchParams]);

	useEffect(() => {
		if (ids.length < 2) {
			navigate(routes.searchDetail(searchId), { replace: true });
		}
	}, [ids.length, searchId, navigate]);

	const q1 = useListing(searchId, ids[0] ?? "");
	const q2 = useListing(searchId, ids[1] ?? "");
	const q3 = useListing(searchId, ids[2] ?? "");
	const q4 = useListing(searchId, ids[3] ?? "");

	const queries = [q1, q2, q3, q4].slice(0, ids.length);
	const allLoaded = queries.every((q) => !q.isLoading);
	const allErrored = queries.every((q) => q.isError);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only re-run when loading state changes
	useEffect(() => {
		if (!allLoaded) return;
		const errorCount = queries.filter((q) => q.isError).length;
		if (errorCount > 0 && !allErrored) {
			toast.error(`${errorCount} annonce(s) introuvable(s)`);
			const validIds = ids.filter((_, i) => !queries[i]?.isError);
			if (validIds.length < 2) {
				navigate(routes.searchDetail(searchId), { replace: true });
			} else if (validIds.length < ids.length) {
				setSearchParams({ ids: validIds.join(",") }, { replace: true });
			}
		}
	}, [allLoaded]);

	const handleRemove = (listingId: string) => {
		const next = ids.filter((i) => i !== listingId);
		if (next.length < 2) {
			navigate(routes.searchDetail(searchId), { replace: true });
		} else {
			setSearchParams({ ids: next.join(",") }, { replace: true });
		}
	};

	const prices = queries.map((q) => q.data?.listing.price ?? null);
	const scores = queries.map((q) => q.data?.analysis?.score ?? null);
	const flagCounts = queries.map((q) => q.data?.analysis?.redFlags?.length ?? null);

	const validPrices = prices.filter((p): p is number => p !== null && p > 0);
	const validScores = scores.filter((s): s is number => s !== null);
	const validFlagCounts = flagCounts.filter((f): f is number => f !== null);

	const bestPrice = validPrices.length > 1 ? Math.min(...validPrices) : null;
	const bestScore = validScores.length > 1 ? Math.max(...validScores) : null;
	const fewestFlags = validFlagCounts.length > 0 ? Math.min(...validFlagCounts) : null;

	if (ids.length < 2) return null;

	if (allErrored) {
		return (
			<div className="flex flex-col items-center justify-center gap-4 py-24">
				<AlertTriangleIcon className="size-12 text-muted-foreground/30" />
				<p className="text-muted-foreground">Impossible de charger la comparaison</p>
				<Button variant="outline" onClick={() => window.location.reload()}>
					Réessayer
				</Button>
			</div>
		);
	}

	if (!allLoaded) {
		return (
			<div className="flex flex-col gap-6 animate-fade-in">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-6 w-64" />
				<div className="grid gap-4" style={{ gridTemplateColumns: `8rem repeat(${ids.length}, 1fr)` }}>
					{Array.from({ length: (ids.length + 1) * 8 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
						<Skeleton key={`sk-${i}`} className="h-10 w-full" />
					))}
				</div>
			</div>
		);
	}

	const listings = queries
		.map((q, i) => (q.data ? { id: ids[i] ?? "", ...q.data } : null))
		.filter((d): d is NonNullable<typeof d> => d !== null);

	return (
		<div className="flex flex-col gap-6 animate-fade-in">
			<Button variant="ghost" size="sm" onClick={() => navigate(routes.searchDetail(searchId))} className="-ml-1 w-fit">
				<ArrowLeftIcon />
				Retour à la recherche
			</Button>

			<h1 className="text-xl font-semibold">Comparaison ({listings.length} annonces)</h1>

			<div className="overflow-x-auto">
				<table className="w-full border-collapse">
					<thead>
						<tr>
							<th className="sticky left-0 z-10 w-32 bg-background shadow-[2px_0_8px_rgba(0,0,0,0.1)]" />
							{listings.map((item) => (
								<th key={item.id} className="min-w-[200px] px-3 pb-3 align-top text-left font-normal">
									{item.listing.images[0] ? (
										<img
											src={item.listing.images[0]}
											alt={item.listing.title}
											className="h-24 w-full rounded-lg object-cover mb-2"
										/>
									) : (
										<div className="h-24 w-full rounded-lg bg-muted mb-2" />
									)}
									<button
										type="button"
										onClick={() => navigate(routes.listingDetail(searchId, item.id))}
										className="text-sm font-medium hover:underline line-clamp-2 text-left"
									>
										{item.listing.title}
									</button>
									<div className="flex items-center gap-1 mt-1">
										<a href={item.listing.url} target="_blank" rel="noopener noreferrer" title="Voir sur Leboncoin">
											<Button variant="ghost" size="icon-sm">
												<ExternalLinkIcon className="size-3.5" />
											</Button>
										</a>
										<Button variant="ghost" size="icon-sm" onClick={() => handleRemove(item.id)} title="Retirer">
											<XIcon className="size-3.5" />
										</Button>
									</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						<tr className="border-t border-border">
							<td className="sticky left-0 z-10 bg-background py-2.5 pr-3 shadow-[2px_0_8px_rgba(0,0,0,0.1)]">
								<span className="text-xs font-medium text-muted-foreground">Prix</span>
							</td>
							{listings.map((item, i) => (
								<td key={item.id} className="px-3 py-2.5">
									<span
										className={cn(
											"text-sm font-bold",
											prices[i] === bestPrice && bestPrice !== null && "text-emerald-500",
										)}
									>
										{formatPrice(item.listing.price)}
										{prices[i] === bestPrice && bestPrice !== null && " ★"}
									</span>
								</td>
							))}
						</tr>
						<tr className="border-t border-border">
							<td className="sticky left-0 z-10 bg-background py-2.5 pr-3 shadow-[2px_0_8px_rgba(0,0,0,0.1)]">
								<span className="text-xs font-medium text-muted-foreground">Score</span>
							</td>
							{listings.map((item, i) => {
								const score = item.analysis?.score ?? null;
								const isBest = scores[i] === bestScore && bestScore !== null;
								return (
									<td key={item.id} className="px-3 py-2.5">
										<ScoreBar score={score} />
										{isBest && score !== null && <span className="text-xs font-bold text-emerald-500"> ★</span>}
									</td>
								);
							})}
						</tr>
						<tr className="border-t border-border">
							<td className="sticky left-0 z-10 bg-background py-2.5 pr-3 shadow-[2px_0_8px_rgba(0,0,0,0.1)]">
								<span className="text-xs font-medium text-muted-foreground">Verdict</span>
							</td>
							{listings.map((item) => (
								<td key={item.id} className="px-3 py-2.5">
									{item.analysis?.verdict ? (
										<p className="text-xs text-muted-foreground whitespace-pre-line">{item.analysis.verdict}</p>
									) : (
										<span className="text-xs text-muted-foreground italic">—</span>
									)}
								</td>
							))}
						</tr>
						<tr className="border-t border-border">
							<td className="sticky left-0 z-10 bg-background py-2.5 pr-3 shadow-[2px_0_8px_rgba(0,0,0,0.1)]">
								<span className="text-xs font-medium text-muted-foreground">Prix marché</span>
							</td>
							{listings.map((item) => (
								<td key={item.id} className="px-3 py-2.5">
									{item.analysis?.marketPriceLow != null && item.analysis?.marketPriceHigh != null ? (
										<span className="text-xs text-muted-foreground">
											{formatPrice(item.analysis.marketPriceLow)} – {formatPrice(item.analysis.marketPriceHigh)}
										</span>
									) : (
										<span className="text-xs text-muted-foreground italic">—</span>
									)}
								</td>
							))}
						</tr>
						<tr className="border-t border-border">
							<td className="sticky left-0 z-10 bg-background py-2.5 pr-3 shadow-[2px_0_8px_rgba(0,0,0,0.1)]">
								<span className="text-xs font-medium text-muted-foreground">Red flags</span>
							</td>
							{listings.map((item, i) => {
								const flags = item.analysis?.redFlags ?? [];
								return (
									<td key={item.id} className="px-3 py-2.5">
										{flags.length === 0 ? (
											<span
												className={cn(
													"text-xs",
													flagCounts[i] === fewestFlags && fewestFlags === 0
														? "text-emerald-500 font-medium"
														: "text-muted-foreground",
												)}
											>
												Aucun
											</span>
										) : (
											<div className="flex flex-wrap gap-1">
												{flags.map((flag) => (
													<Badge key={flag} variant="destructive" className="text-[10px]">
														{flag}
													</Badge>
												))}
											</div>
										)}
									</td>
								);
							})}
						</tr>
						<tr className="border-t border-border">
							<td className="sticky left-0 z-10 bg-background py-2.5 pr-3 shadow-[2px_0_8px_rgba(0,0,0,0.1)]">
								<span className="text-xs font-medium text-muted-foreground">Vendeur</span>
							</td>
							{listings.map((item) => (
								<td key={item.id} className="px-3 py-2.5">
									<span className="text-xs text-muted-foreground">
										{sellerLabels[item.listing.sellerType] ?? item.listing.sellerType}
									</span>
								</td>
							))}
						</tr>
						<tr className="border-t border-border">
							<td className="sticky left-0 z-10 bg-background py-2.5 pr-3 shadow-[2px_0_8px_rgba(0,0,0,0.1)]">
								<span className="text-xs font-medium text-muted-foreground">Localisation</span>
							</td>
							{listings.map((item) => (
								<td key={item.id} className="px-3 py-2.5">
									<span className="text-xs text-muted-foreground">{item.listing.location}</span>
								</td>
							))}
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
};

export const Component = ComparePage;
