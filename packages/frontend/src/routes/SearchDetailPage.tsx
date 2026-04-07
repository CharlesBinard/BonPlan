import { SearchStatus } from "@bonplan/shared/types";
import {
	ArrowLeftIcon,
	BarChart3Icon,
	BellIcon,
	Loader2Icon,
	MessageSquareTextIcon,
	PauseIcon,
	PlayIcon,
	SearchIcon,
	ShoppingBagIcon,
	TrashIcon,
	ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useDeleteSearch, useListings, useSearch, useTriggerSearch, useUpdateSearch } from "@/api";
import { ListingCard } from "@/components/ListingCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { statusColors, statusLabels } from "@/constants/search-status";
import { cn } from "@/lib/utils";

const sortOptions = [
	{ value: "score_desc", label: "Meilleur score" },
	{ value: "score_asc", label: "Score croissant" },
	{ value: "price_asc", label: "Prix croissant" },
	{ value: "price_desc", label: "Prix décroissant" },
	{ value: "date_desc", label: "Plus récents" },
	{ value: "date_asc", label: "Plus anciens" },
];

const SearchDetailPage = () => {
	const { id = "" } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
	const [editWebhookUrl, setEditWebhookUrl] = useState("");
	const [instructionsDialogOpen, setInstructionsDialogOpen] = useState(false);
	const [editInstructions, setEditInstructions] = useState("");

	const sort = searchParams.get("sort") ?? "score_desc";
	const minScore = searchParams.get("minScore") ? Number(searchParams.get("minScore")) : 0;

	const { data: searchData, isLoading: searchLoading } = useSearch(id);
	const {
		data: listingsData,
		isLoading: listingsLoading,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useListings(id, { sort, minScore });

	const trigger = useTriggerSearch();
	const update = useUpdateSearch();
	const del = useDeleteSearch();

	const search = searchData?.search;
	const isActive = search?.status === SearchStatus.Active;
	const canPauseResume = search?.status === SearchStatus.Active || search?.status === SearchStatus.Paused;

	const allListings = listingsData?.pages.flatMap((p) => p.listings) ?? [];

	const handleDelete = async () => {
		await del.mutateAsync({ id });
		setDeleteDialogOpen(false);
		navigate("/searches");
	};

	const openWebhookDialog = () => {
		setEditWebhookUrl(search?.notifyWebhook ?? "");
		setWebhookDialogOpen(true);
	};

	const openInstructionsDialog = () => {
		setEditInstructions(search?.customInstructions ?? "");
		setInstructionsDialogOpen(true);
	};

	// Compute summary stats from visible listings
	const avgScore =
		allListings.length > 0
			? Math.round(allListings.reduce((sum, l) => sum + (l.analysis?.score ?? 0), 0) / allListings.length)
			: 0;
	const goodDealCount = allListings.filter((l) => (l.analysis?.score ?? 0) >= 70).length;

	return (
		<div className="flex flex-col gap-6 animate-fade-in">
			{/* Back button */}
			<Button
				variant="ghost"
				size="sm"
				onClick={() => navigate("/searches")}
				className="-ml-1 w-fit"
				aria-label="Retour aux recherches"
			>
				<ArrowLeftIcon />
				Mes recherches
			</Button>

			{/* Search header */}
			{searchLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-6 w-64" />
					<Skeleton className="h-4 w-40" />
				</div>
			) : search ? (
				<div className="flex flex-col gap-3">
					<div className="flex flex-wrap items-start gap-3">
						<h1 className="flex-1 text-xl font-semibold">{search.query}</h1>
						<Badge className={cn("border-0", statusColors[search.status] ?? "bg-muted text-muted-foreground")}>
							{statusLabels[search.status] ?? search.status}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground">{search.location}</p>

					{/* Action buttons */}
					<div className="flex flex-wrap gap-2">
						<Button size="sm" variant="outline" onClick={() => trigger.mutate({ id })} disabled={trigger.isPending}>
							{trigger.isPending ? <Loader2Icon className="animate-spin" /> : <ZapIcon />}
							Scraper maintenant
						</Button>
						{canPauseResume && (
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									update.mutate({
										id,
										data: { status: isActive ? SearchStatus.Paused : SearchStatus.Active },
									})
								}
								disabled={update.isPending}
							>
								{update.isPending ? <Loader2Icon className="animate-spin" /> : isActive ? <PauseIcon /> : <PlayIcon />}
								{isActive ? "Mettre en pause" : "Reprendre"}
							</Button>
						)}
						<Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={del.isPending}>
							{del.isPending ? <Loader2Icon className="animate-spin" /> : <TrashIcon />}
							Supprimer
						</Button>
					</div>

					{/* Notifications */}
					<div className="flex flex-col gap-2">
						<h2 className="text-sm font-medium text-muted-foreground">Notifications</h2>
						<div className="flex items-center gap-2 text-sm">
							<BellIcon className="size-4 text-muted-foreground" />
							<span className="truncate max-w-64 text-muted-foreground">
								{search.notifyWebhook ?? "Aucun webhook configuré"}
							</span>
							<Button variant="outline" size="sm" onClick={openWebhookDialog}>
								Modifier
							</Button>
						</div>
					</div>

					{/* Custom instructions */}
					<div className="flex flex-col gap-2">
						<h2 className="text-sm font-medium text-muted-foreground">Instructions IA</h2>
						<div className="flex items-start gap-2 text-sm">
							<MessageSquareTextIcon className="size-4 text-muted-foreground mt-0.5" />
							<span className="text-muted-foreground flex-1">
								{search.customInstructions || "Aucune instruction spécifique"}
							</span>
							<Button variant="outline" size="sm" onClick={openInstructionsDialog}>
								Modifier
							</Button>
						</div>
					</div>
				</div>
			) : null}

			{/* Summary bar */}
			{!listingsLoading && allListings.length > 0 && (
				<div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-muted/30 px-4 py-3">
					<div className="flex items-center gap-2 text-sm">
						<SearchIcon className="size-4 text-muted-foreground" />
						<span className="font-medium">{allListings.length}</span>
						<span className="text-muted-foreground">annonces</span>
					</div>
					<div className="h-4 w-px bg-border" />
					<div className="flex items-center gap-2 text-sm">
						<ShoppingBagIcon className="size-4 text-green-600" />
						<span className="font-medium text-green-600">{goodDealCount}</span>
						<span className="text-muted-foreground">bonnes affaires</span>
					</div>
					<div className="h-4 w-px bg-border" />
					<div className="flex items-center gap-2 text-sm">
						<BarChart3Icon className="size-4 text-muted-foreground" />
						<span className="text-muted-foreground">Score moyen :</span>
						<span className="font-medium">{avgScore}/100</span>
					</div>
				</div>
			)}

			{/* Filter bar */}
			<div className="flex flex-wrap items-center gap-4">
				<div className="flex items-center gap-2">
					<span className="text-sm text-muted-foreground">Trier par</span>
					<Select
						value={sort}
						onValueChange={(v) => {
							if (v !== null) {
								setSearchParams((prev) => {
									prev.set("sort", v);
									return prev;
								});
							}
						}}
					>
						<SelectTrigger size="sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{sortOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-sm text-muted-foreground">Score min</span>
					<input
						id="minScore"
						type="range"
						min={0}
						max={100}
						step={5}
						value={minScore}
						onChange={(e) => {
							setSearchParams((prev) => {
								const val = Number(e.target.value);
								if (val > 0) {
									prev.set("minScore", String(val));
								} else {
									prev.delete("minScore");
								}
								return prev;
							});
						}}
						className="w-28 accent-primary"
					/>
					<Badge variant="outline" className="tabular-nums font-mono text-xs">
						{minScore}
					</Badge>
				</div>
			</div>

			{/* Listings grid */}
			{listingsLoading ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 8 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
						<Skeleton key={i} className="h-56 rounded-xl" />
					))}
				</div>
			) : allListings.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
					<SearchIcon className="size-16 text-muted-foreground/20" />
					<p className="text-muted-foreground">Aucune annonce pour le moment.</p>
					<Button variant="outline" size="sm" onClick={() => trigger.mutate({ id })} disabled={trigger.isPending}>
						<ZapIcon />
						Lancer un scrape
					</Button>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{allListings.map((listing, index) => (
						<div key={listing.id} className="animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
							<ListingCard listing={listing} analysis={listing.analysis} searchId={id} />
						</div>
					))}
				</div>
			)}

			{/* Load more */}
			{hasNextPage && (
				<div className="flex justify-center">
					<Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
						{isFetchingNextPage && <Loader2Icon className="animate-spin" />}
						{isFetchingNextPage ? "Chargement…" : "Charger plus"}
					</Button>
				</div>
			)}

			{/* Delete confirmation dialog */}
			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent showCloseButton={false} className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Supprimer cette recherche ?</DialogTitle>
						<DialogDescription>
							Cette action est irréversible. Toutes les annonces associées seront également supprimées.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="destructive" onClick={handleDelete} disabled={del.isPending}>
							{del.isPending ? <Loader2Icon className="animate-spin" /> : <TrashIcon />}
							{del.isPending ? "Suppression…" : "Supprimer"}
						</Button>
						<DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Webhook edit dialog */}
			<Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Modifier les notifications</DialogTitle>
						<DialogDescription>
							Configurez l'URL webhook pour recevoir les alertes de bonnes affaires.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="editWebhookUrl">URL Webhook</Label>
							<Input
								id="editWebhookUrl"
								value={editWebhookUrl}
								onChange={(e) => setEditWebhookUrl(e.target.value)}
								placeholder="https://discord.com/api/webhooks/..."
							/>
							<p className="text-[11px] text-muted-foreground">
								Laissez vide pour désactiver les notifications webhook.
							</p>
						</div>
					</div>
					<DialogFooter>
						<DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
						<Button
							onClick={async () => {
								await update.mutateAsync({
									id: search!.id,
									data: { notifyWebhook: editWebhookUrl || null },
								});
								setWebhookDialogOpen(false);
							}}
							disabled={update.isPending}
						>
							{update.isPending && <Loader2Icon className="animate-spin" />}
							Sauvegarder
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Instructions edit dialog */}
			<Dialog open={instructionsDialogOpen} onOpenChange={setInstructionsDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Instructions pour l'IA</DialogTitle>
						<DialogDescription>
							Guidez l'analyse IA pour cette recherche. Ces instructions s'ajoutent à vos instructions globales.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="editInstructions">Instructions</Label>
							<Textarea
								id="editInstructions"
								value={editInstructions}
								onChange={(e) => setEditInstructions(e.target.value)}
								placeholder="Ex: Je cherche uniquement avec boîte d'origine..."
								maxLength={500}
								rows={3}
							/>
							<p className="text-[11px] text-muted-foreground flex justify-between">
								<span>Laissez vide pour supprimer les instructions.</span>
								<span className="tabular-nums">{editInstructions.length}/500</span>
							</p>
						</div>
					</div>
					<DialogFooter>
						<DialogClose render={<Button variant="outline" />}>Annuler</DialogClose>
						<Button
							onClick={async () => {
								await update.mutateAsync({
									id: search!.id,
									data: { customInstructions: editInstructions.trim() || null },
								});
								setInstructionsDialogOpen(false);
							}}
							disabled={update.isPending}
						>
							{update.isPending && <Loader2Icon className="animate-spin" />}
							Sauvegarder
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export const Component = SearchDetailPage;
