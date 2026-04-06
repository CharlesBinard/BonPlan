# Location Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain text location input with an autocomplete component that queries the French government geocoding API, stores structured coordinates, and passes them directly to the orchestrator.

**Architecture:** A proxy endpoint in the gateway forwards autocomplete queries to `data.geopf.fr`. The frontend uses a `@base-ui/react`-based combobox with TanStack Query for fetching. Selected coordinates are stored in 3 new DB columns (`postcode`, `latitude`, `longitude`) and used directly by the orchestrator, skipping its geocoding step.

**Tech Stack:** Hono/zod-openapi (gateway), Drizzle ORM (schema/migration), @base-ui/react Combobox (frontend), TanStack Query (data fetching)

**Spec:** `docs/superpowers/specs/2026-04-06-location-autocomplete-design.md`

---

### Task 1: Shared GeocodedLocation type

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts` (already re-exports `./types`, no change needed)
- Modify: `packages/orchestrator/src/services/geocoding.ts` (remove duplicate type, import from shared)
- Modify: `packages/orchestrator/src/services/lbc-url-builder.ts` (update import)

- [ ] **Step 1: Add GeocodedLocation to shared types**

In `packages/shared/src/types.ts`, add at the end of the file:

```ts
export type GeocodedLocation = {
	city: string;
	postcode: string;
	latitude: number;
	longitude: number;
};
```

- [ ] **Step 2: Update orchestrator geocoding.ts to import from shared**

In `packages/orchestrator/src/services/geocoding.ts`:
- Remove the local `GeocodedLocation` type definition (lines 7-12)
- Add import: `import type { GeocodedLocation } from "@bonplan/shared";`
- Keep the `export` on the function, but re-export the type: `export type { GeocodedLocation } from "@bonplan/shared";`

- [ ] **Step 3: Update lbc-url-builder.ts import**

In `packages/orchestrator/src/services/lbc-url-builder.ts`, change line 1:
```ts
// Before:
import type { GeocodedLocation } from "./geocoding";
// After:
import type { GeocodedLocation } from "@bonplan/shared";
```

- [ ] **Step 4: Run typecheck**

Run: `cd packages/orchestrator && bun run typecheck`
Expected: PASS — no type errors

- [ ] **Step 5: Run existing tests**

Run: `cd packages/orchestrator && bun test`
Expected: All tests pass (lbc-url-builder tests still work)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types.ts packages/orchestrator/src/services/geocoding.ts packages/orchestrator/src/services/lbc-url-builder.ts
git commit -m "refactor: move GeocodedLocation type to @bonplan/shared"
```

---

### Task 2: DB schema — add postcode, latitude, longitude columns

**Files:**
- Modify: `packages/shared/src/db/schema.ts:92-125` (searches table)

- [ ] **Step 1: Add imports**

In `packages/shared/src/db/schema.ts`, add `doublePrecision` to the drizzle import (line 5):

```ts
// Before:
import {
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// After:
import {
	boolean,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Add columns to searches table**

In the `searches` table definition, add 3 columns after `location` (after line 100):

```ts
		postcode: text("postcode"),
		latitude: doublePrecision("latitude"),
		longitude: doublePrecision("longitude"),
```

- [ ] **Step 3: Add CHECK constraints**

In the searches table's constraint array (the function at line 119), add these checks after the existing ones:

```ts
		check("latitude_range", sql`${table.latitude} IS NULL OR ${table.latitude} BETWEEN -90 AND 90`),
		check("longitude_range", sql`${table.longitude} IS NULL OR ${table.longitude} BETWEEN -180 AND 180`),
		check("lat_lon_both_or_neither", sql`(${table.latitude} IS NULL) = (${table.longitude} IS NULL)`),
```

- [ ] **Step 4: Generate Drizzle migration**

Run: `cd packages/shared && bun run drizzle-kit generate`
Expected: A new migration file `0005_*.sql` is created in `packages/shared/drizzle/` with `ALTER TABLE searches ADD COLUMN` statements.

- [ ] **Step 5: Verify migration SQL**

Read the generated migration file and verify it contains:
- `ALTER TABLE "searches" ADD COLUMN "postcode" text;`
- `ALTER TABLE "searches" ADD COLUMN "latitude" double precision;`
- `ALTER TABLE "searches" ADD COLUMN "longitude" double precision;`
- The 3 CHECK constraints

- [ ] **Step 6: Run typecheck**

Run: `cd packages/shared && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/db/schema.ts packages/shared/drizzle/
git commit -m "feat(db): add postcode, latitude, longitude columns to searches"
```

---

### Task 3: Gateway — geocode proxy endpoint

**Files:**
- Create: `packages/gateway/src/routes/geocode/geocode.routes.ts`
- Create: `packages/gateway/src/routes/geocode/geocode.handlers.ts`
- Modify: `packages/gateway/src/app.ts:62` (add route mounting)

- [ ] **Step 1: Create geocode.routes.ts**

Create `packages/gateway/src/routes/geocode/geocode.routes.ts`:

```ts
import { createRoute, z } from "@hono/zod-openapi";

export const geocodeSearchSchema = z.object({
	q: z.string().min(2).max(200),
	limit: z.coerce.number().int().min(1).max(10).default(5),
});

const geocodeResultSchema = z.object({
	city: z.string(),
	postcode: z.string(),
	latitude: z.number(),
	longitude: z.number(),
});

export const geocodeSearchRoute = createRoute({
	method: "get",
	path: "/search",
	tags: ["Geocode"],
	request: {
		query: geocodeSearchSchema,
	},
	responses: {
		200: {
			description: "Geocoding results",
			content: {
				"application/json": {
					schema: z.object({ results: z.array(geocodeResultSchema) }),
				},
			},
		},
		502: {
			description: "Geocoding service unavailable",
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
		},
	},
});
```

- [ ] **Step 2: Create geocode.handlers.ts**

Create `packages/gateway/src/routes/geocode/geocode.handlers.ts`:

```ts
import { createLogger } from "@bonplan/shared";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthEnv } from "../../middleware/auth";
import { geocodeSearchRoute } from "./geocode.routes";

const logger = createLogger("gateway");

const GEOCODING_API = "https://data.geopf.fr/geocodage/search/";

export const geocodeRoutes = new OpenAPIHono<AuthEnv>();

geocodeRoutes.openapi(geocodeSearchRoute, async (c) => {
	const { q, limit } = c.req.valid("query");

	try {
		const url = new URL(GEOCODING_API);
		url.searchParams.set("q", q);
		url.searchParams.set("type", "municipality");
		url.searchParams.set("limit", String(limit));

		const res = await fetch(url.toString(), {
			signal: AbortSignal.timeout(5000),
		});

		if (!res.ok) {
			logger.warn("Geocoding API upstream error", { status: res.status, query: q });
			return c.json({ error: "Geocoding service unavailable" }, 502);
		}

		const data = (await res.json()) as {
			features: Array<{
				geometry: { coordinates: [number, number] };
				properties: { city: string; postcode: string };
			}>;
		};

		const results = data.features.map((f) => ({
			city: f.properties.city,
			postcode: f.properties.postcode,
			latitude: f.geometry.coordinates[1],
			longitude: f.geometry.coordinates[0],
		}));

		return c.json({ results });
	} catch (err) {
		logger.warn("Geocoding proxy failed", { query: q, error: err instanceof Error ? err.message : String(err) });
		return c.json({ error: "Geocoding service unavailable" }, 502);
	}
});
```

- [ ] **Step 3: Mount in app.ts**

In `packages/gateway/src/app.ts`, add import and route mounting:

Import (add after line 14):
```ts
import { geocodeRoutes } from "./routes/geocode/geocode.handlers";
```

Mount (add after line 61, before the searches route):
```ts
app.route("/api/geocode", geocodeRoutes);
```

- [ ] **Step 4: Run typecheck**

Run: `cd packages/gateway && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/routes/geocode/ packages/gateway/src/app.ts
git commit -m "feat(gateway): add geocode proxy endpoint for location autocomplete"
```

---

### Task 4: Gateway — update createSearchSchema for coordinates

**Files:**
- Modify: `packages/gateway/src/routes/searches/searches.schemas.ts:4-19`
- Modify: `packages/gateway/src/routes/searches/searches.handlers.ts:50-61`
- Modify: `packages/gateway/src/schemas/shared.ts:16-35` (searchResponseSchema)

- [ ] **Step 1: Update createSearchSchema**

In `packages/gateway/src/routes/searches/searches.schemas.ts`, add 3 fields to `createSearchSchema` after the `location` field:

```ts
export const createSearchSchema = z.object({
	query: z.string().min(1).max(500),
	location: z.string().max(200).default(""),
	postcode: z.string().max(10).optional().nullable(),
	latitude: z.number().min(-90).max(90).optional().nullable(),
	longitude: z.number().min(-180).max(180).optional().nullable(),
	radiusKm: z.number().int().min(1).max(500),
	intervalMin: z.number().int().min(5).max(1440).default(15),
	notifyWebhook: z
		.string()
		.url()
		.refine((url) => url.startsWith("https://"), "Webhook must use HTTPS")
		.optional()
		.nullable(),
	notifyDiscord: z.boolean().default(false),
	discordChannelId: z.string().optional().nullable(),
	minScore: z.number().int().min(0).max(100).default(70),
	allowBundles: z.boolean().default(false),
});
```

- [ ] **Step 2: Update searchResponseSchema**

In `packages/gateway/src/schemas/shared.ts`, add the 3 new fields to `searchResponseSchema` after `location`:

```ts
	postcode: z.string().nullable(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
```

- [ ] **Step 3: Update create handler to pass new fields**

In `packages/gateway/src/routes/searches/searches.handlers.ts`, update the `.values()` call (around line 50-61) to include:

```ts
		postcode: body.postcode ?? null,
		latitude: body.latitude ?? null,
		longitude: body.longitude ?? null,
```

Add these 3 lines after `location: body.location,` (line 53).

- [ ] **Step 4: Run typecheck**

Run: `cd packages/gateway && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/gateway/src/routes/searches/searches.schemas.ts packages/gateway/src/schemas/shared.ts packages/gateway/src/routes/searches/searches.handlers.ts
git commit -m "feat(gateway): accept postcode/latitude/longitude in search creation"
```

---

### Task 5: Orchestrator — use stored coordinates, skip geocoding

**Files:**
- Modify: `packages/orchestrator/src/handlers/on-search-created.ts:143-156`

- [ ] **Step 1: Update the geocoding section**

In `packages/orchestrator/src/handlers/on-search-created.ts`, replace lines 143-153:

```ts
	// Before:
	// Geocode location (if not "Toute la France")
	let geocodedLocation = null;
	if (search.location && search.location.trim() !== "") {
		geocodedLocation = await geocodeCity(search.location);
		if (!geocodedLocation) {
			logger.warn("Could not geocode location, falling back to France-wide search", {
				searchId,
				location: search.location,
			});
		}
	}
```

Replace with:

```ts
	// Use stored coordinates if available, otherwise geocode
	let geocodedLocation: import("@bonplan/shared").GeocodedLocation | null = null;
	if (
		search.latitude != null &&
		search.longitude != null &&
		!(search.latitude === 0 && search.longitude === 0)
	) {
		geocodedLocation = {
			city: search.location,
			postcode: search.postcode ?? "",
			latitude: search.latitude,
			longitude: search.longitude,
		};
		logger.info("Using stored coordinates", { searchId, lat: search.latitude, lng: search.longitude });
	} else if (search.location && search.location.trim() !== "") {
		geocodedLocation = await geocodeCity(search.location);
		if (!geocodedLocation) {
			logger.warn("Could not geocode location, falling back to France-wide search", {
				searchId,
				location: search.location,
			});
		}
	}
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/orchestrator && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Run existing tests**

Run: `cd packages/orchestrator && bun test`
Expected: All tests pass (lbc-url-builder tests still use the same GeocodedLocation shape)

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/src/handlers/on-search-created.ts
git commit -m "feat(orchestrator): use stored coordinates, fallback to geocoding"
```

---

### Task 6: Frontend — update schemas

**Files:**
- Modify: `packages/frontend/src/forms/schemas.ts:24-31`

- [ ] **Step 1: Update searchCreateSchema**

In `packages/frontend/src/forms/schemas.ts`, update `searchCreateSchema`:

```ts
export const searchCreateSchema = z.object({
	query: z.string().min(3, "Minimum 3 caractères").max(500),
	location: z.string().max(500).default(""),
	postcode: z.string().max(10).optional().nullable(),
	latitude: z.number().min(-90).max(90).optional().nullable(),
	longitude: z.number().min(-180).max(180).optional().nullable(),
	radiusKm: z.number().int().min(1).max(500).default(30),
	intervalMin: z.number().int().min(5).max(1440).default(15),
	minScore: z.number().int().min(0).max(100).default(70),
	allowBundles: z.boolean().default(false),
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/frontend/src/forms/schemas.ts
git commit -m "feat(frontend): add coordinate fields to search create schema"
```

---

### Task 7: Frontend — LocationAutocomplete component

**Files:**
- Create: `packages/frontend/src/components/ui/location-autocomplete.tsx`

- [ ] **Step 1: Create the component**

Create `packages/frontend/src/components/ui/location-autocomplete.tsx`:

```tsx
import type { GeocodedLocation } from "@bonplan/shared";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, MapPinIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/config/api";
import { cn } from "@/lib/utils";

// ── Hook ────────────────────────────────────────────────────────────
function useLocationSearch(debouncedQuery: string) {
	return useQuery({
		queryKey: ["geocode", debouncedQuery],
		queryFn: () =>
			api<{ results: GeocodedLocation[] }>(`/api/geocode/search?q=${encodeURIComponent(debouncedQuery)}&limit=5`),
		enabled: debouncedQuery.length >= 2,
		staleTime: 5 * 60 * 1000, // 5 min cache
	});
}

// ── Component ───────────────────────────────────────────────────────
type LocationAutocompleteProps = {
	value: GeocodedLocation | null;
	onChange: (location: GeocodedLocation | null) => void;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
	className?: string;
};

function formatLocation(loc: GeocodedLocation): string {
	return `${loc.city} (${loc.postcode})`;
}

export function LocationAutocomplete({
	value,
	onChange,
	placeholder = "ex: Paris, 75001...",
	disabled,
	id,
	className,
}: LocationAutocompleteProps) {
	const [inputValue, setInputValue] = useState(value ? formatLocation(value) : "");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	// Sync input value when external value changes
	useEffect(() => {
		if (value) {
			setInputValue(formatLocation(value));
		}
	}, [value]);

	// Debounce
	useEffect(() => {
		if (!inputValue || inputValue.length < 2 || value) {
			setDebouncedQuery("");
			return;
		}
		const timer = setTimeout(() => setDebouncedQuery(inputValue), 300);
		return () => clearTimeout(timer);
	}, [inputValue, value]);

	// Fetch
	const { data, isLoading, isError } = useLocationSearch(debouncedQuery);
	const results = data?.results ?? [];

	// Open dropdown when we have results or loading/error state
	useEffect(() => {
		if (debouncedQuery.length >= 2 && !value) {
			setIsOpen(true);
		}
	}, [debouncedQuery, results, isLoading, value]);

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const selectLocation = (loc: GeocodedLocation) => {
		onChange(loc);
		setInputValue(formatLocation(loc));
		setIsOpen(false);
		setHighlightedIndex(-1);
	};

	const clearSelection = () => {
		onChange(null);
		setInputValue("");
		setDebouncedQuery("");
		setIsOpen(false);
		inputRef.current?.focus();
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = e.target.value;
		setInputValue(newValue);
		// If user edits after selection, clear the structured value
		if (value) {
			onChange(null);
		}
		setHighlightedIndex(-1);
		if (!newValue) {
			setIsOpen(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!isOpen || results.length === 0) {
			if (e.key === "ArrowDown" && results.length > 0) {
				setIsOpen(true);
				setHighlightedIndex(0);
				e.preventDefault();
			}
			return;
		}

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
				break;
			case "ArrowUp":
				e.preventDefault();
				setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
				break;
			case "Enter":
				e.preventDefault();
				if (highlightedIndex >= 0 && results[highlightedIndex]) {
					selectLocation(results[highlightedIndex]);
				}
				break;
			case "Escape":
				setIsOpen(false);
				setHighlightedIndex(-1);
				break;
			case "Home":
				e.preventDefault();
				setHighlightedIndex(0);
				break;
			case "End":
				e.preventDefault();
				setHighlightedIndex(results.length - 1);
				break;
		}
	};

	// Scroll highlighted item into view
	useEffect(() => {
		if (highlightedIndex >= 0 && listRef.current) {
			const item = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
			item?.scrollIntoView({ block: "nearest" });
		}
	}, [highlightedIndex]);

	const showDropdown = isOpen && !value && debouncedQuery.length >= 2;

	return (
		<div ref={containerRef} className="relative">
			<div className="relative">
				<input
					ref={inputRef}
					id={id}
					type="text"
					role="combobox"
					aria-expanded={showDropdown}
					aria-autocomplete="list"
					aria-controls={id ? `${id}-listbox` : undefined}
					aria-activedescendant={
						highlightedIndex >= 0 && id ? `${id}-option-${highlightedIndex}` : undefined
					}
					value={inputValue}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						if (debouncedQuery.length >= 2 && !value && results.length > 0) {
							setIsOpen(true);
						}
					}}
					placeholder={placeholder}
					disabled={disabled}
					className={cn(
						"h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 pr-8 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30",
						className,
					)}
				/>
				{/* Right icon: spinner, clear button, or nothing */}
				<div className="absolute right-2 top-1/2 -translate-y-1/2">
					{isLoading && !value && (
						<Loader2Icon className="size-4 animate-spin text-muted-foreground" />
					)}
					{value && (
						<button
							type="button"
							onClick={clearSelection}
							className="text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Effacer la localisation"
						>
							<XIcon className="size-4" />
						</button>
					)}
				</div>
			</div>

			{/* Dropdown */}
			{showDropdown && (
				<ul
					ref={listRef}
					id={id ? `${id}-listbox` : undefined}
					role="listbox"
					className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md"
				>
					{results.length > 0 &&
						results.map((loc, i) => (
							<li
								key={`${loc.city}-${loc.postcode}`}
								id={id ? `${id}-option-${i}` : undefined}
								role="option"
								aria-selected={highlightedIndex === i}
								className={cn(
									"flex cursor-pointer items-center gap-2 px-3 min-h-[44px] text-sm transition-colors",
									highlightedIndex === i
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:bg-accent/50",
								)}
								onMouseDown={(e) => {
									e.preventDefault(); // Prevent input blur
									selectLocation(loc);
								}}
								onMouseEnter={() => setHighlightedIndex(i)}
							>
								<MapPinIcon className="size-3.5 shrink-0" />
								<span>
									{loc.city}{" "}
									<span className="text-muted-foreground/70">({loc.postcode})</span>
								</span>
							</li>
						))}
					{results.length === 0 && !isLoading && !isError && (
						<li className="px-3 py-2.5 text-sm text-muted-foreground">Aucun résultat</li>
					)}
					{isError && (
						<li className="px-3 py-2.5 text-sm text-destructive">Erreur de recherche</li>
					)}
				</ul>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/ui/location-autocomplete.tsx
git commit -m "feat(frontend): add LocationAutocomplete component with debounced search"
```

---

### Task 8: Frontend — integrate into SearchCreateDialog

**Files:**
- Modify: `packages/frontend/src/routes/SearchesPage.tsx:1-298`

- [ ] **Step 1: Update imports**

In `packages/frontend/src/routes/SearchesPage.tsx`, add the import (after line 12):

```ts
import type { GeocodedLocation } from "@bonplan/shared";
import { LocationAutocomplete } from "@/components/ui/location-autocomplete";
```

Remove `MapPinIcon` from the lucide-react import on line 7 (it's no longer needed directly in this file — only used inside LocationAutocomplete).

- [ ] **Step 2: Update state in SearchCreateDialog**

In `SearchCreateDialog` (line 79-298), replace the location state:

```ts
// Before (line 83):
const [location, setLocation] = useState("");

// After:
const [selectedLocation, setSelectedLocation] = useState<GeocodedLocation | null>(null);
```

- [ ] **Step 3: Update reset function**

Update the `reset` function (line 91-100):

```ts
// Before:
setLocation("");

// After:
setSelectedLocation(null);
```

- [ ] **Step 4: Update onSubmit**

Update `onSubmit` (line 102-125). Change the `safeParse` call:

```ts
		const result = searchCreateSchema.safeParse({
			query,
			location: nationWide ? "" : (selectedLocation?.city ?? ""),
			postcode: nationWide ? null : (selectedLocation?.postcode ?? null),
			latitude: nationWide ? null : (selectedLocation?.latitude ?? null),
			longitude: nationWide ? null : (selectedLocation?.longitude ?? null),
			radiusKm: nationWide ? 30 : Number(radiusKm),
			intervalMin: Number(intervalMin),
			minScore: Number(minScore),
			allowBundles,
		});
```

- [ ] **Step 5: Update validation state**

Update validation (line 129):

```ts
// Before:
const locationValid = nationWide || location.length > 0;

// After:
const locationValid = nationWide || selectedLocation !== null;
```

- [ ] **Step 6: Replace the location Input with LocationAutocomplete**

Replace the location FormField block (lines 179-195):

```tsx
						{!nationWide && (
							<FormField
								label="Localisation"
								htmlFor="location"
								required
								error={fieldErrors.location}
								valid={selectedLocation !== null}
								helpText="Ville ou code postal"
							>
								<LocationAutocomplete
									id="location"
									value={selectedLocation}
									onChange={setSelectedLocation}
								/>
							</FormField>
						)}
```

Note: We keep the existing `fieldErrors.location` from Zod for server-side validation errors.

- [ ] **Step 7: Update the preview section**

Update the location display in the preview (lines 266-271):

```tsx
							<div className="flex items-center gap-2">
								<span className="text-muted-foreground">Lieu :</span>
								<span className="font-medium">
									{nationWide
										? "Toute la France"
										: selectedLocation
											? `${selectedLocation.city} (${selectedLocation.postcode})${radiusKm ? ` (${radiusKm} km)` : ""}`
											: "..."}
								</span>
							</div>
```

- [ ] **Step 8: Add auto-focus when toggling "Toute la France" off**

The `LocationAutocomplete` component exposes an input ref internally. To auto-focus when the toggle switches off, add a `useEffect` in `SearchCreateDialog` after the state declarations:

```tsx
	const locationRef = useRef<HTMLDivElement>(null);

	// Auto-focus location input when "Toute la France" is toggled off
	useEffect(() => {
		if (!nationWide) {
			// Small delay to let the component mount
			setTimeout(() => {
				const input = locationRef.current?.querySelector("input");
				input?.focus();
			}, 50);
		}
	}, [nationWide]);
```

Then wrap the LocationAutocomplete in the ref:

```tsx
						{!nationWide && (
							<div ref={locationRef}>
								<FormField ...>
									<LocationAutocomplete ... />
								</FormField>
							</div>
						)}
```

- [ ] **Step 9: Run typecheck**

Run: `cd packages/frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/frontend/src/routes/SearchesPage.tsx
git commit -m "feat(frontend): integrate LocationAutocomplete into SearchCreateDialog"
```

---

### Task 9: Apply migration & manual testing

- [ ] **Step 1: Apply migration**

Run: `bun run db:push` (or `cd packages/shared && bun run drizzle-kit push`)
Expected: Migration applies, new columns visible in DB

- [ ] **Step 2: Start dev server**

Run: `bun run dev`
Expected: All services start without errors

- [ ] **Step 3: Manual test — autocomplete flow**

1. Open the app, go to Searches page
2. Click "Nouvelle recherche"
3. Type "Par" in the location field
4. Verify dropdown appears with suggestions (Paris, Parisot, etc.)
5. Click "Paris (75001)" — verify it fills the input
6. Verify the X button clears the selection
7. Verify keyboard navigation (arrows, Enter, Escape)
8. Toggle "Toute la France" — verify the field hides
9. Toggle back — verify the field reappears empty
10. Submit a search with a selected location — verify it creates successfully

- [ ] **Step 4: Manual test — orchestrator uses coordinates**

1. After creating a search with a selected location, check the orchestrator logs
2. Verify it logs "Using stored coordinates" instead of calling geocodeCity
3. Verify the search activates and gets scheduled

- [ ] **Step 5: Manual test — backwards compatibility**

1. If there are existing searches without coordinates, trigger them
2. Verify they still work (orchestrator falls back to geocoding)

- [ ] **Step 6: Commit any fixes**

If any issues found during manual testing, fix and commit.

---

### Task 10: Regenerate Orval API client

> **Note:** This task requires the gateway to be running (for the OpenAPI spec at `/openapi.json`). Run `bun run dev` first if not already running. This updates the `useCreateSearch` hook types to accept `postcode`, `latitude`, `longitude`.

- [ ] **Step 1: Regenerate OpenAPI types**

The gateway OpenAPI spec now includes the geocode endpoint and the updated search schema. Regenerate the frontend API client:

Run: `cd packages/frontend && bun run orval`
Expected: `packages/frontend/src/api/generated/bonPlanAPI.ts` is regenerated with updated types

- [ ] **Step 2: Verify no type conflicts**

Run: `cd packages/frontend && bun run typecheck`
Expected: PASS — the `useCreateSearch` hook should now accept the new fields

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/api/generated/
git commit -m "chore(frontend): regenerate Orval API client with geocode endpoint"
```
