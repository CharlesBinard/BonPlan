import { HeartIcon } from "lucide-react";
import { type FavoriteResponse, useFavorites } from "@/api";
import { ListingCard } from "@/components/ListingCard";
import { Skeleton } from "@/components/ui/skeleton";

const FavoritesPage = () => {
	const { data, isLoading } = useFavorites();
	const favorites: FavoriteResponse[] = data?.favorites ?? [];

	return (
		<div className="flex flex-col gap-6 animate-fade-in">
			<h1 className="text-xl font-semibold">Mes favoris</h1>

			{isLoading ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
						<Skeleton key={i} className="h-56 rounded-xl" />
					))}
				</div>
			) : favorites.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
					<HeartIcon className="size-16 text-muted-foreground/20" />
					<div className="flex flex-col gap-1">
						<p className="font-medium text-muted-foreground">Pas encore de favoris</p>
						<p className="text-sm text-muted-foreground">Parcourez vos annonces pour en ajouter</p>
					</div>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{favorites.map((fav, index) => (
						<div key={fav.id} className="animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
							<ListingCard listing={fav.listing} searchId={fav.listing.searchId} isFavorite={true} />
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export const Component = FavoritesPage;
