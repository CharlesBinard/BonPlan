# Listing Comparison — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare 2-4 listings side-by-side in a table layout with visual delta indicators (best price, best score).

**Architecture:** Frontend-only feature. Selection mode on SearchDetailPage (checkboxes on ListingCards + sticky action bar), "Comparer avec..." Sheet on ListingDetailPage, new ComparePage at `/searches/:id/compare?ids=...`. Data fetched via existing `useListing` hook in parallel. No backend changes.

**Tech Stack:** React 19, react-router-dom v7, TanStack Query v5, Tailwind CSS v4, shadcn/ui, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-07-listing-comparison-design.md`

---

### Task 1: Route constant + router entry

**Files:**
- Modify: `packages/frontend/src/constants/routes.ts`
- Modify: `packages/frontend/src/router.tsx`

- [ ] **Step 1: Add route constant**

In `packages/frontend/src/constants/routes.ts`, add after `listingDetail` (line 5):

```typescript
searchCompare: (id: string) => `/searches/${id}/compare`,
```

- [ ] **Step 2: Add router entry**

In `packages/frontend/src/router.tsx`, add a new lazy route inside the `children` array, between `/searches/:id` (line 44) and `/searches/:id/listings/:listingId` (line 45):

```typescript
{ path: "/searches/:id/compare", lazy: () => import("@/routes/ComparePage") },
```

- [ ] **Step 3: Run typecheck**

Run: `cd packages/frontend && bunx tsc --noEmit`

Expected: FAIL — `ComparePage` module doesn't exist yet. That's expected; we'll create it in Task 5.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/constants/routes.ts packages/frontend/src/router.tsx
git commit -m "feat(frontend): add compare route constant and router entry"
```

---

### Task 2: ListingCard — selection props + checkbox overlay

**Files:**
- Modify: `packages/frontend/src/components/ListingCard.tsx`

- [ ] **Step 1: Extend the props interface**

In `packages/frontend/src/components/ListingCard.tsx`, add new optional props to `ListingCardProps` (after `isFavorite`, line 30):

```typescript
selectable?: boolean;
selected?: boolean;
onSelect?: (id: string) => void;
selectDisabled?: boolean;
```

- [ ] **Step 2: Destructure the new props**

Update the component signature (line 61) to destructure the new props:

```typescript
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
```

- [ ] **Step 3: Add the checkbox click handler**

After `handleFavoriteClick` (line 77), add:

```typescript
const handleSelectClick = (e: React.MouseEvent) => {
	e.stopPropagation();
	if (!selectDisabled || selected) {
		onSelect?.(listing.id);
	}
};
```

The condition `!selectDisabled || selected` allows deselecting even when max is reached, but prevents new selections.

- [ ] **Step 4: Add the checkbox overlay in the image area**

Inside the `{thumbnail && (` block (line 88), after the opening `<div className="relative">` and before the `<img>`, add:

```tsx
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
```

- [ ] **Step 5: Add checkbox for cards without thumbnail**

After the image block closing `)}` (line 97) and before `<CardContent>` (line 99), add a fallback checkbox for cards without images:

```tsx
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
```

- [ ] **Step 6: Run typecheck**

Run: `cd packages/frontend && bunx tsc --noEmit`

Expected: PASS (all new props are optional, existing call sites unaffected)

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/ListingCard.tsx
git commit -m "feat(frontend): add selection checkbox overlay to ListingCard"
```

---

### Task 3: SearchDetailPage — selection mode + sticky action bar

**Files:**
- Modify: `packages/frontend/src/routes/SearchDetailPage.tsx`

- [ ] **Step 1: Add imports**

Add to the lucide-react import (line 2):

```typescript
GitCompareArrows,
```

Add at the top:

```typescript
import { routes } from "@/constants/routes";
```

- [ ] **Step 2: Add selection state**

In the `SearchDetailPage` component, after the existing state declarations (line 51), add:

```typescript
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: Add toggle and selection handlers**

After the `openInstructionsDialog` function, add:

```typescript
const toggleSelectionMode = () => {
	setSelectionMode((prev) => {
		if (prev) setSelectedIds(new Set());
		return !prev;
	});
};

const handleSelect = (id: string) => {
	setSelectedIds((prev) => {
		const next = new Set(prev);
		if (next.has(id)) {
			next.delete(id);
		} else if (next.size < 4) {
			next.add(id);
		}
		return next;
	});
};
```

- [ ] **Step 4: Add compare toggle button to the filter bar**

In the filter bar `<div>` (line 214), add a new element at the end (after the score min slider div, before the closing `</div>` of the filter bar):

```tsx
<Button
	size="sm"
	variant={selectionMode ? "default" : "outline"}
	onClick={toggleSelectionMode}
>
	<GitCompareArrows className="size-4" />
	{selectionMode ? "Annuler" : "Comparer"}
</Button>
```

- [ ] **Step 5: Pass selection props to ListingCard**

Update the `<ListingCard>` rendering in the listings grid (line 289) to pass selection props:

```tsx
<ListingCard
	listing={listing}
	analysis={listing.analysis}
	searchId={id}
	selectable={selectionMode}
	selected={selectedIds.has(listing.id)}
	onSelect={handleSelect}
	selectDisabled={selectedIds.size >= 4}
/>
```

- [ ] **Step 6: Add the sticky action bar**

After the "Charger plus" button section (after line 280) and before the delete confirmation dialog, add:

```tsx
{/* Compare action bar */}
{selectionMode && selectedIds.size >= 2 && (
	<div className="sticky bottom-0 z-30 flex items-center justify-between gap-4 rounded-xl border-t bg-background/95 px-4 py-3 backdrop-blur">
		<span className="text-sm font-medium">
			{selectedIds.size} annonce{selectedIds.size > 1 ? "s" : ""} sélectionnée{selectedIds.size > 1 ? "s" : ""}
		</span>
		<div className="flex items-center gap-2">
			<Button variant="outline" size="sm" onClick={toggleSelectionMode}>
				Annuler
			</Button>
			<Button
				size="sm"
				onClick={() => navigate(`${routes.searchCompare(id)}?ids=${[...selectedIds].join(",")}`)}
			>
				<GitCompareArrows className="size-4" />
				Comparer
			</Button>
		</div>
	</div>
)}
```

- [ ] **Step 7: Run typecheck**

Run: `cd packages/frontend && bunx tsc --noEmit`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/routes/SearchDetailPage.tsx
git commit -m "feat(frontend): add listing selection mode and compare action bar"
```

---

### Task 4: ListingDetailPage — "Comparer avec..." button + Sheet

**Files:**
- Modify: `packages/frontend/src/routes/ListingDetailPage.tsx`

- [ ] **Step 1: Add imports**

Add to the lucide-react import:

```typescript
GitCompareArrows,
```

Add new imports:

```typescript
import { useListings } from "@/api";
import { routes } from "@/constants/routes";
import { ScoreCircle } from "@/components/ScoreBar";
import {
	Sheet,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
```

- [ ] **Step 2: Add state**

In the component, after the existing state (line 52), add:

```typescript
const [compareSheetOpen, setCompareSheetOpen] = useState(false);
const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: Fetch other listings for the picker**

After the existing hooks (line 67), add:

```typescript
const {
	data: listingsData,
	fetchNextPage: fetchMoreListings,
	hasNextPage: hasMoreListings,
	isFetchingNextPage: isFetchingMoreListings,
} = useListings(id, { sort: "score_desc" });

const otherListings = (listingsData?.pages.flatMap((p) => p.listings) ?? []).filter(
	(l) => l.id !== listingId,
);
```

Note: Using `sort: "score_desc"` ensures the list endpoint joins analysis data (score is needed for the picker badges).

- [ ] **Step 4: Add compare selection handler**

After the `openInstructionsDialog` function, add:

```typescript
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
```

- [ ] **Step 5: Add the compare button next to "Voir sur Leboncoin"**

Replace the external link section (lines 255-261) with a side-by-side layout:

```tsx
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
		Comparer
	</Button>
</div>
```

- [ ] **Step 6: Add the Sheet component**

After the instructions edit dialog (at the end of the component JSX, before the closing `</div>`), add:

```tsx
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
									isSelected
										? "border-primary bg-primary text-primary-foreground"
										: "border-muted-foreground/50",
								)}
							>
								{isSelected && (
									<svg viewBox="0 0 16 16" fill="currentColor" className="size-3">
										<path d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z" />
									</svg>
								)}
							</div>
							{item.images[0] ? (
								<img
									src={item.images[0]}
									alt=""
									className="size-10 shrink-0 rounded object-cover"
								/>
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
				{hasMoreListings && (
					<Button
						variant="ghost"
						size="sm"
						className="mx-auto"
						onClick={() => fetchMoreListings()}
						disabled={isFetchingMoreListings}
					>
						{isFetchingMoreListings ? (
							<Loader2Icon className="animate-spin size-4" />
						) : (
							"Charger plus..."
						)}
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
					navigate(`${routes.searchCompare(id)}?ids=${ids}`);
				}}
			>
				<GitCompareArrows className="size-4" />
				Comparer ({compareIds.size + 1})
			</Button>
		</SheetFooter>
	</SheetContent>
</Sheet>
```

- [ ] **Step 7: Run typecheck**

Run: `cd packages/frontend && bunx tsc --noEmit`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/routes/ListingDetailPage.tsx
git commit -m "feat(frontend): add compare picker sheet to listing detail page"
```

---

### Task 5: ComparePage — comparison table

**Files:**
- Create: `packages/frontend/src/routes/ComparePage.tsx`

- [ ] **Step 1: Create the ComparePage component**

Create `packages/frontend/src/routes/ComparePage.tsx`:

```tsx
import { AlertTriangleIcon, ArrowLeftIcon, ExternalLinkIcon, Loader2Icon, XIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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

type CompareColumnProps = {
	searchId: string;
	listingId: string;
	onRemove: (id: string) => void;
	isBestPrice: boolean;
	isBestScore: boolean;
	hasFewestFlags: boolean;
};

const CompareColumn = ({ searchId, listingId, onRemove, isBestPrice, isBestScore, hasFewestFlags }: CompareColumnProps) => {
	const { data, isLoading, isError } = useListing(searchId, listingId);

	if (isLoading) {
		return (
			<div className="flex flex-col gap-3 min-w-[200px]">
				<Skeleton className="h-24 w-full rounded-lg" />
				{Array.from({ length: 7 }).map((_, i) => (
					<Skeleton key={`skel-${listingId}-${i}`} className="h-8 w-full" />
				))}
			</div>
		);
	}

	if (isError || !data) return null;

	const { listing, analysis } = data;
	const thumbnail = listing.images[0];
	const score = analysis?.score ?? null;
	const redFlags = analysis?.redFlags ?? [];

	return (
		<div className="flex flex-col gap-0 min-w-[200px]">
			{/* Header */}
			<div className="flex flex-col gap-2 border-b border-border pb-3 mb-1">
				{thumbnail ? (
					<img src={thumbnail} alt={listing.title} className="h-24 w-full rounded-lg object-cover" />
				) : (
					<div className="h-24 w-full rounded-lg bg-muted" />
				)}
				<a
					href={routes.listingDetail(searchId, listingId)}
					className="text-sm font-medium hover:underline line-clamp-2"
					onClick={(e) => { e.preventDefault(); window.location.href = routes.listingDetail(searchId, listingId); }}
				>
					{listing.title}
				</a>
				<div className="flex items-center gap-1">
					<a href={listing.url} target="_blank" rel="noopener noreferrer" title="Voir sur Leboncoin">
						<Button variant="ghost" size="icon-sm">
							<ExternalLinkIcon className="size-3.5" />
						</Button>
					</a>
					<Button variant="ghost" size="icon-sm" onClick={() => onRemove(listingId)} title="Retirer">
						<XIcon className="size-3.5" />
					</Button>
				</div>
			</div>

			{/* Prix */}
			<div className="border-b border-border py-2.5">
				<span className={cn("text-sm font-bold", isBestPrice && "text-emerald-500")}>
					{formatPrice(listing.price)}
					{isBestPrice && " ★"}
				</span>
			</div>

			{/* Score */}
			<div className="border-b border-border py-2.5">
				<div className={cn(isBestScore && "[&_span]:text-emerald-500")}>
					<ScoreBar score={score} />
					{isBestScore && score !== null && (
						<span className="text-xs font-bold text-emerald-500"> ★</span>
					)}
				</div>
			</div>

			{/* Verdict */}
			<div className="border-b border-border py-2.5">
				{analysis?.verdict ? (
					<p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-4">
						{analysis.verdict}
					</p>
				) : (
					<span className="text-xs text-muted-foreground italic">—</span>
				)}
			</div>

			{/* Prix marché */}
			<div className="border-b border-border py-2.5">
				{analysis?.marketPriceLow != null && analysis?.marketPriceHigh != null ? (
					<span className="text-xs text-muted-foreground">
						{formatPrice(analysis.marketPriceLow)} – {formatPrice(analysis.marketPriceHigh)}
					</span>
				) : (
					<span className="text-xs text-muted-foreground italic">—</span>
				)}
			</div>

			{/* Red flags */}
			<div className="border-b border-border py-2.5">
				{redFlags.length === 0 ? (
					<span className={cn("text-xs", hasFewestFlags ? "text-emerald-500 font-medium" : "text-muted-foreground")}>
						Aucun
					</span>
				) : (
					<div className="flex flex-wrap gap-1">
						{redFlags.map((flag) => (
							<Badge key={flag} variant="destructive" className="text-[10px]">
								{flag}
							</Badge>
						))}
					</div>
				)}
			</div>

			{/* Vendeur */}
			<div className="border-b border-border py-2.5">
				<span className="text-xs text-muted-foreground">
					{sellerLabels[listing.sellerType] ?? listing.sellerType}
				</span>
			</div>

			{/* Localisation */}
			<div className="py-2.5">
				<span className="text-xs text-muted-foreground">{listing.location}</span>
			</div>
		</div>
	);
};

const ComparePage = () => {
	const { id: searchId = "" } = useParams<{ id: string }>();
	const [searchParams, setSearchParams] = useSearchParams();
	const navigate = useNavigate();

	const ids = useMemo(() => {
		const raw = searchParams.get("ids") ?? "";
		return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 4);
	}, [searchParams]);

	useEffect(() => {
		if (ids.length < 2) {
			navigate(routes.searchDetail(searchId), { replace: true });
		}
	}, [ids.length, searchId, navigate]);

	// Fetch all listings in parallel (each useListing call is a separate hook, but we use
	// the CompareColumn component which calls useListing internally)
	// We need the data here for delta computation, so we also call useListing at this level
	const q1 = useListing(searchId, ids[0] ?? "");
	const q2 = useListing(searchId, ids[1] ?? "");
	const q3 = useListing(searchId, ids[2] ?? "");
	const q4 = useListing(searchId, ids[3] ?? "");

	const queries = [q1, q2, q3, q4].slice(0, ids.length);
	const allLoaded = queries.every((q) => !q.isLoading);
	const allErrored = queries.every((q) => q.isError);

	const handleRemove = (listingId: string) => {
		const next = ids.filter((i) => i !== listingId);
		if (next.length < 2) {
			navigate(routes.searchDetail(searchId), { replace: true });
		} else {
			setSearchParams({ ids: next.join(",") }, { replace: true });
		}
	};

	// Compute deltas
	const prices = queries.map((q) => q.data?.listing.price ?? null);
	const scores = queries.map((q) => q.data?.analysis?.score ?? null);
	const flagCounts = queries.map((q) => q.data?.analysis?.redFlags?.length ?? null);

	const validPrices = prices.filter((p): p is number => p !== null && p > 0);
	const validScores = scores.filter((s): s is number => s !== null);
	const validFlagCounts = flagCounts.filter((f): f is number => f !== null);

	const bestPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
	const bestScore = validScores.length > 0 ? Math.max(...validScores) : null;
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

	const rowLabels = ["Prix", "Score", "Verdict", "Prix marché", "Red flags", "Vendeur", "Localisation"];

	return (
		<div className="flex flex-col gap-6 animate-fade-in">
			<Button
				variant="ghost"
				size="sm"
				onClick={() => navigate(routes.searchDetail(searchId))}
				className="-ml-1 w-fit"
			>
				<ArrowLeftIcon />
				Retour à la recherche
			</Button>

			<h1 className="text-xl font-semibold">
				Comparaison ({ids.length} annonces)
			</h1>

			<div className="overflow-x-auto">
				<div className="flex gap-0 min-w-fit">
					{/* Label column */}
					<div className="sticky left-0 z-10 flex flex-col gap-0 w-32 shrink-0 bg-background shadow-[2px_0_8px_rgba(0,0,0,0.1)]">
						{/* Header spacer */}
						<div className="border-b border-border pb-3 mb-1">
							<div className="h-24" />
							<div className="h-5" />
							<div className="h-8" />
						</div>
						{rowLabels.map((label) => (
							<div key={label} className="border-b border-border py-2.5 last:border-b-0">
								<span className="text-xs font-medium text-muted-foreground">{label}</span>
							</div>
						))}
					</div>

					{/* Listing columns */}
					{ids.map((listingId, i) => (
						<div key={listingId} className="flex-1 px-3">
							<CompareColumn
								searchId={searchId}
								listingId={listingId}
								onRemove={handleRemove}
								isBestPrice={allLoaded && prices[i] === bestPrice && validPrices.length > 1}
								isBestScore={allLoaded && scores[i] === bestScore && validScores.length > 1}
								hasFewestFlags={allLoaded && flagCounts[i] === fewestFlags && fewestFlags === 0}
							/>
						</div>
					))}
				</div>
			</div>
		</div>
	);
};

export const Component = ComparePage;
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/frontend && bunx tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Run linter**

Run: `bunx biome check packages/frontend/src/routes/ComparePage.tsx`

Expected: No errors. If formatting issues, fix with `bunx biome check --write packages/frontend/src/routes/ComparePage.tsx`.

- [ ] **Step 4: Build frontend**

Run: `cd packages/frontend && bun run build`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/routes/ComparePage.tsx
git commit -m "feat(frontend): add listing comparison page with delta indicators"
```

---

### Task 6: Integration verification

- [ ] **Step 1: Run full typecheck**

Run: `bunx turbo typecheck`

Expected: All 8 packages pass.

- [ ] **Step 2: Run all tests**

Run: `bun test`

Expected: All tests pass (no test files modified, all existing tests unaffected).

- [ ] **Step 3: Run linter**

Run: `bunx biome check packages/`

Expected: No errors.

- [ ] **Step 4: Build frontend**

Run: `cd packages/frontend && bun run build`

Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test**

1. Open SearchDetailPage for a search with listings
2. Click "Comparer" toggle in the filter bar → checkboxes appear on cards
3. Select 2-4 listings → sticky action bar appears at bottom
4. Click "Comparer" → navigates to compare page with table
5. Verify best price and best score are highlighted in green with ★
6. Click × to remove a listing → URL updates, listing removed
7. Remove until < 2 → redirects back to search
8. Go to a listing detail page → click "Comparer" button → Sheet opens
9. Select 1-3 other listings in the Sheet → click "Comparer" → compare page
10. Test on mobile width → verify horizontal scroll with sticky labels

- [ ] **Step 6: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration fixes for listing comparison"
```
