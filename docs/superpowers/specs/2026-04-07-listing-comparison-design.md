# Listing Comparison — Design Spec

**Date:** 2026-04-07
**Status:** Approved (rev.2 — updated with review findings)
**Scope:** Compare 2-4 listings side-by-side in a table layout with visual delta indicators

---

## Overview

Users can select 2-4 listings from a search and compare them in a dedicated table view. The comparison highlights the best price and score with visual indicators. No backend changes — entirely client-side with IDs stored in URL query params.

## Entry Points

### 1. SearchDetailPage — Grid selection mode

A "Comparer" toggle button in the filter bar activates selection mode. Uses `GitCompareArrows` icon from lucide-react (no `Icon` suffix). When active:
- Each `ListingCard` shows a checkbox overlay (top-left corner, opposite the score circle in top-right)
- If a card has no thumbnail image, the checkbox renders at the top-left of the card content area instead
- Clicking the checkbox toggles selection without navigating
- Clicking elsewhere on the card still navigates to the detail page
- When `selectedIds.size >= 2`, a **sticky bottom action bar** appears (using `sticky bottom-0` inside the `<main>` scroll area — NOT `fixed`, to avoid collision with the MobileNav which renders outside `<main>`):
  - Text: "{N} annonces sélectionnées"
  - "Comparer" button → navigates to `/searches/:id/compare?ids=id1,id2,id3,id4`
  - "Annuler" button → clears selection and exits selection mode
  - Styled: `bg-background/95 backdrop-blur border-t px-4 py-3 z-30`
- When 4 are selected, remaining checkboxes are visually disabled (muted, cursor-not-allowed)
- Exiting selection mode clears all selections

### 2. ListingDetailPage — "Comparer avec..." button

A "Comparer avec..." button placed next to the "Voir sur Leboncoin" button (side-by-side in a `flex gap-2` row). On click, a `<Sheet>` sidebar opens with:
- Title: "Choisir des annonces à comparer"
- Scrollable list of other listings from the same search, fetched via `useListings(searchId)` with **infinite scroll** (the hook returns `useInfiniteQuery` — call `fetchNextPage` when scrolling near bottom, show "Charger plus..." at the end if `hasNextPage`)
- Current listing excluded from the list (filtered client-side by ID)
- Each item: thumbnail (40x40, fallback placeholder if no image), title (truncated), price formatted EUR, score badge
- Checkbox per item, max 3 selectable (current listing automatically included → total max 4)
- "Comparer" button in `<SheetFooter>` → navigates to `/searches/:id/compare?ids=currentId,sel1,sel2,...`

## Comparison Page

### Route

`/searches/:id/compare?ids=id1,id2,id3,id4`

Lazy-loaded page component. Must export `const Component = ComparePage;` (standard lazy-load convention). Route placed inside the existing `ProtectedRoute` children array in `router.tsx`, between `/searches/:id` and `/searches/:id/listings/:listingId`.

### URL Parsing and Validation

On mount, parse the `ids` query param:
1. Split by comma
2. Filter empty/whitespace strings
3. Deduplicate
4. Truncate to first 4
5. If fewer than 2 IDs remain, redirect to `/searches/:id`

### Data Fetching

Call `useListing(searchId, listingId)` in parallel for each valid ID. React Query handles deduplication and caching. This is preferred over `useListings` because the list endpoint conditionally joins analysis data (only when sorting by score), while the detail endpoint always returns the full analysis.

### UI States

- **Loading:** Skeleton table with N columns matching the number of IDs. Each column shows a skeleton thumbnail, title bar, and data rows.
- **Partial error:** If some listings return 404 (deleted, wrong search), filter them out. If ≥ 2 valid listings remain, show comparison with a toast: "N annonce(s) introuvable(s)". If < 2 remain, redirect to search page.
- **Full error:** "Impossible de charger la comparaison" with a "Réessayer" button.

### Layout — Table (criteria as rows, listings as columns)

**Header row:** Per listing column:
- Thumbnail image (first image, clickable → detail page; placeholder if no images)
- Title (clickable → link to `/searches/:id/listings/:listingId`)
- "Voir sur Leboncoin" icon button (external link to `listing.url`, new tab)
- Remove button (× icon) to drop a listing from comparison (updates URL params via `setSearchParams`; if < 2 remain, redirect back to search)

**Data rows:**

| Row | Content | Delta indicator |
|-----|---------|-----------------|
| Prix | Formatted EUR (cents/100) | Lowest in green with ★ |
| Score | Score value + `<ScoreBar>` component (reuse existing) | Highest in green with ★ |
| Verdict | Bullet points from AI verdict | — |
| Prix marché | Low-High range in EUR | — |
| Red flags | `<Badge variant="destructive">` pills, or "Aucun" with `className="text-emerald-500"` | Fewest flags highlighted |
| Vendeur | Type icon + label (Particulier/Pro) | — |
| Localisation | City name | — |

**Delta logic:**
- Best price = lowest non-zero price → `text-emerald-500 font-bold` + ★ character
- Best score = highest non-null score → `text-emerald-500 font-bold` + ★ character
- Fewest red flags = smallest `redFlags.length` (only highlight if 0 flags) → "Aucun" in `text-emerald-500`
- No new Badge variant needed — use inline Tailwind classes for green highlighting

### Responsive behavior

- Desktop (lg+): all columns visible, label column (`w-32`) sticky left
- Tablet (md): same but tighter spacing
- Mobile (< md): horizontal scroll with `overflow-x-auto`, label column sticky left (`sticky left-0 bg-background`) with right shadow (`shadow-[2px_0_8px_rgba(0,0,0,0.1)]`), listing columns `min-w-[200px]`

### Navigation

- Back button → `/searches/:id`
- Listing title → `/searches/:id/listings/:listingId`
- "Voir sur Leboncoin" → `listing.url` (new tab)

## Component Changes

### ListingCard — new optional props

```typescript
selectable?: boolean;    // show checkbox overlay
selected?: boolean;      // checkbox checked state
onSelect?: (id: string) => void;  // toggle callback
disabled?: boolean;      // checkbox visually disabled (max reached)
```

When `selectable` is true:
- Checkbox renders in top-left corner (absolute positioned over the image area)
- If no thumbnail, render at the top-left of the card content
- Click on checkbox calls `onSelect(listing.id)` with `e.stopPropagation()`
- Checkbox styled with Tailwind (native `<input type="checkbox">` with custom styles, or a simple styled `<div>` toggle) — no Checkbox UI component dependency
- Rest of card behavior unchanged (existing `isFavorite` prop unaffected)

### SearchDetailPage — selection state

```typescript
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

Toggle button in filter bar: `GitCompareArrows` icon + "Comparer" label. Active state styled with `bg-primary text-primary-foreground`.

### ListingDetailPage — compare button + Sheet

New "Comparer avec..." button and Sheet component. The Sheet content manages its own selection state (local `useState<Set<string>>`). The Sheet listing list uses infinite scroll with `useListings`.

## New Files

| File | Purpose |
|------|---------|
| `packages/frontend/src/routes/ComparePage.tsx` | Comparison table page component (exports `const Component`) |

## Modified Files

| File | Change |
|------|--------|
| `packages/frontend/src/router.tsx` | Add `/searches/:id/compare` lazy route inside ProtectedRoute children |
| `packages/frontend/src/components/ListingCard.tsx` | Add `selectable`, `selected`, `onSelect`, `disabled` props + checkbox overlay |
| `packages/frontend/src/routes/SearchDetailPage.tsx` | Add selection mode toggle, selectedIds state, sticky bottom action bar |
| `packages/frontend/src/routes/ListingDetailPage.tsx` | Add "Comparer avec..." button + Sheet with infinite-scroll listing picker |
| `packages/frontend/src/constants/routes.ts` | Add `searchCompare: (id: string) => \`/searches/${id}/compare\`` route constant |

## Out of Scope

- No backend changes (no DB, no API, no migration)
- No persistence of comparisons
- No cross-search comparison (same search only)
- No export/share of comparison
- No comparison history
- No favorite toggle in comparison view (can be added later)
- No Checkbox UI component — use native styled checkbox or div toggle
