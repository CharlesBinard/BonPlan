import { HeartIcon, SearchIcon, ShoppingBagIcon, TrendingUpIcon } from "lucide-react";
import { useGoodDeals, useSearches, useSettings, useStats } from "@/api";
import { ApiKeyBanner } from "@/components/ApiKeyBanner";
import { ListingCard } from "@/components/ListingCard";
import { SearchCard } from "@/components/SearchCard";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const StatCard = ({
	title,
	value,
	icon: Icon,
	color,
}: {
	title: string;
	value: number | undefined;
	icon: React.ComponentType<{ className?: string }>;
	color: "blue" | "purple" | "rose" | "emerald";
}) => {
	const colorStyles = {
		blue: { icon: "text-blue-400", bg: "bg-blue-500/15", ring: "ring-blue-500/20" },
		purple: { icon: "text-purple-400", bg: "bg-purple-500/15", ring: "ring-purple-500/20" },
		rose: { icon: "text-rose-400", bg: "bg-rose-500/15", ring: "ring-rose-500/20" },
		emerald: { icon: "text-emerald-400", bg: "bg-emerald-500/15", ring: "ring-emerald-500/20" },
	}[color];

	return (
		<div className={`rounded-xl border border-border/50 p-4 ${colorStyles.bg} ring-1 ${colorStyles.ring}`}>
			<div className="flex items-center gap-3">
				<div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${colorStyles.bg}`}>
					<Icon className={`size-5 ${colorStyles.icon}`} />
				</div>
				<div className="min-w-0">
					{value === undefined ? (
						<Skeleton className="h-7 w-12 mb-1" />
					) : (
						<p className="text-2xl font-bold tracking-tight">{value}</p>
					)}
					<p className="text-xs font-medium text-muted-foreground">{title}</p>
				</div>
			</div>
		</div>
	);
};

export const DashboardPage = () => {
	const { data: statsData, isLoading: statsLoading } = useStats();
	const { data: searchesData, isLoading: searchesLoading } = useSearches();
	const { data: goodDealsData, isLoading: goodDealsLoading } = useGoodDeals();
	const { data: settingsData } = useSettings();

	const stats = statsData;
	const searches = searchesData?.searches ?? [];
	const recentSearches = searches.slice(0, 5);
	const goodDeals = goodDealsData?.goodDeals ?? [];

	return (
		<div className="flex flex-col gap-6 animate-fade-in">
			<h1 className="text-xl font-semibold">Tableau de bord</h1>

			{settingsData && !settingsData.hasApiKey && (
				<ApiKeyBanner hasApiKey={false} aiProvider={settingsData.aiProvider} />
			)}

			{/* Stats grid */}
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{statsLoading ? (
					Array.from({ length: 4 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
						<Card key={i}>
							<CardHeader>
								<Skeleton className="h-4 w-24" />
							</CardHeader>
							<CardContent>
								<Skeleton className="h-7 w-12" />
							</CardContent>
						</Card>
					))
				) : (
					<>
						<div className="animate-slide-up" style={{ animationDelay: "0ms" }}>
							<StatCard title="Recherches" value={stats?.searchCount} icon={SearchIcon} color="blue" />
						</div>
						<div className="animate-slide-up" style={{ animationDelay: "50ms" }}>
							<StatCard title="Annonces" value={stats?.listingCount} icon={ShoppingBagIcon} color="purple" />
						</div>
						<div className="animate-slide-up" style={{ animationDelay: "100ms" }}>
							<StatCard title="Favoris" value={stats?.favoriteCount} icon={HeartIcon} color="rose" />
						</div>
						<div className="animate-slide-up" style={{ animationDelay: "150ms" }}>
							<StatCard title="Bonnes affaires" value={stats?.goodDealCount} icon={TrendingUpIcon} color="emerald" />
						</div>
					</>
				)}
			</div>

			{/* Good deals */}
			<div>
				<h2 className="mb-3 text-base font-semibold flex items-center gap-2">
					<TrendingUpIcon className="size-4 text-emerald-600" />
					Dernieres bonnes affaires
				</h2>
				{goodDealsLoading ? (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
							<Skeleton key={i} className="h-64 rounded-xl" />
						))}
					</div>
				) : goodDeals.length === 0 ? (
					<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
						<TrendingUpIcon className="size-10 text-muted-foreground/20" />
						<p className="text-sm text-muted-foreground">Aucune bonne affaire detectee pour le moment.</p>
					</div>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{goodDeals.map((deal, index) => (
							<div key={deal.id} className="animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
								<ListingCard listing={deal} analysis={deal.analysis} searchId={deal.searchId} />
							</div>
						))}
					</div>
				)}
			</div>

			{/* Recent searches */}
			<div>
				<h2 className="mb-3 text-base font-semibold flex items-center gap-2">
					<SearchIcon className="size-4 text-blue-600" />
					Recherches recentes
				</h2>
				{searchesLoading ? (
					<div className="flex flex-col gap-3">
						{Array.from({ length: 3 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
							<Skeleton key={i} className="h-32 w-full rounded-xl" />
						))}
					</div>
				) : recentSearches.length === 0 ? (
					<div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-12 text-center">
						<SearchIcon className="size-10 text-muted-foreground/20" />
						<p className="text-sm text-muted-foreground">Aucune recherche pour le moment.</p>
					</div>
				) : (
					<div className="flex flex-col gap-3">
						{recentSearches.map((search, index) => (
							<div key={search.id} className="animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
								<SearchCard search={search} />
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
};
