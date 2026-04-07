# Listing Comparison — Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Scope:** Compare 2-4 listings side-by-side in a table layout with visual delta indicators

---

## Overview

Users can select 2-4 listings from a search and compare them in a dedicated table view. The comparison highlights the best price and score with visual indicators. No backend changes — entirely client-side with IDs stored in URL query params.

## Entry Points

### 1. SearchDetailPage — Grid selection mode

A "Comparer" toggle button in the filter bar activates selection mode. When active:
- Each `ListingCard` shows a checkbox overlay (top-left corner, opposite the score circle in top-right)
- Clicking the checkbox toggles selection without navigating
- Clicking elsewhere on the card still navigates to the detail page
- When `selectedIds.size >= 2`, a fixed bottom action bar appears:
  - Text: "{N} annonces sélectionnées"
  - "Comparer" button → navigates to `/searches/:id/compare?ids=id1,id2,id3,id4`
  - "Annuler" button → clears selection and exits selection mode
- When 4 are selected, remaining checkboxes are visually disabled
- Exiting selection mode clears all selections

### 2. ListingDetailPage — "Comparer avec..." button

A "Comparer avec..." button placed next to the "Voir sur Leboncoin" button. On click, a `<Sheet>` sidebar opens with:
- Title: "Choisir des annonces à comparer"
- Scrollable list of other listings from the same search (fetched via `useListings(searchId)`)
- Each item: thumbnail (40x40), title (truncated), price, score badge
- Checkbox per item, max 3 selectable (current listing is automatically included → total max 4)
- "Comparer" button at bottom → navigates to `/searches/:id/compare?ids=currentId,sel1,sel2,...`
- Current listing excluded from the selectable list

## Comparison Page

### Route

`/searches/:id/compare?ids=id1,id2,id3,id4`

Lazy-loaded page component. If fewer than 2 valid IDs in query params, redirect to `/searches/:id`.

### Data Fetching

Call `useListing(searchId, listingId)` in parallel for each ID. React Query handles deduplication and caching. Show skeleton loading while any query is pending.

### Layout — Table (criteria as rows, listings as columns)

**Header row:** Per listing column:
- Thumbnail image (first image, clickable)
- Title (clickable → link to `/searches/:id/listings/:listingId`)
- "Voir sur Leboncoin" icon button (external link to `listing.url`)
- Remove button (× icon) to drop a listing from comparison (removes from URL params; if < 2 remain, redirect back to search)

**Data rows:**

| Row | Content | Delta indicator |
|-----|---------|-----------------|
| Prix | Formatted EUR (cents/100) | Lowest in green with ★ |
| Score | Score value + colored score bar | Highest in green with ★ |
| Verdict | Bullet points from AI verdict | — |
| Prix marché | Low-High range in EUR | — |
| Red flags | Pill badges (red), or "Aucun" in green | Fewest flags in green |
| Vendeur | Type icon + label (Particulier/Pro) | — |
| Localisation | City name | — |

**Delta logic:**
- Best price = lowest non-zero price → green text + ★ badge
- Best score = highest non-null score → green text + ★ badge  
- Fewest red flags = smallest `redFlags.length` (only highlight if 0 flags) → "Aucun" in green text

### Responsive behavior

- Desktop (lg+): all columns visible, first column (labels) sticky left
- Tablet (md): same but tighter spacing
- Mobile (< md): horizontal scroll, label column sticky left with shadow separator

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
- Checkbox renders in top-left corner (absolute positioned)
- Click on checkbox calls `onSelect(listing.id)` with `e.stopPropagation()`
- Rest of card behavior unchanged

### SearchDetailPage — selection state

```typescript
const [selectionMode, setSelectionMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

Toggle button in filter bar: icon `GitCompareArrowsIcon` + "Comparer" label. Active state styled like a pressed toggle.

### ListingDetailPage — compare button + Sheet

New "Comparer avec..." button and Sheet component. The Sheet content is a self-contained component that manages its own selection state (local `useState<Set<string>>`).

## New Files

| File | Purpose |
|------|---------|
| `packages/frontend/src/routes/ComparePage.tsx` | Comparison table page component |

## Modified Files

| File | Change |
|------|--------|
| `packages/frontend/src/router.tsx` | Add `/searches/:id/compare` route |
| `packages/frontend/src/components/ListingCard.tsx` | Add `selectable`, `selected`, `onSelect`, `disabled` props + checkbox overlay |
| `packages/frontend/src/routes/SearchDetailPage.tsx` | Add selection mode toggle, selectedIds state, floating action bar |
| `packages/frontend/src/routes/ListingDetailPage.tsx` | Add "Comparer avec..." button + Sheet with listing picker |
| `packages/frontend/src/constants/routes.ts` | Add `COMPARE` route constant |

## Out of Scope

- No backend changes (no DB, no API, no migration)
- No persistence of comparisons
- No cross-search comparison (same search only)
- No export/share of comparison
- No comparison history
