import type { GeocodedLocation } from "@bonplan/shared/types";
import { useQuery } from "@tanstack/react-query";
import { Loader2Icon, MapPinIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
		retry: 1,
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

function LocationAutocomplete({
	value,
	onChange,
	placeholder = "ex: Paris, 75001...",
	disabled,
	id: idProp,
	className,
}: LocationAutocompleteProps) {
	const fallbackId = useId();
	const id = idProp ?? fallbackId;

	const [inputValue, setInputValue] = useState(value ? formatLocation(value) : "");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);

	// Sync input value when external value changes (including reset to null)
	useEffect(() => {
		setInputValue(value ? formatLocation(value) : "");
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

	// Open dropdown when debounced query is ready
	useEffect(() => {
		if (debouncedQuery.length >= 2 && !value) {
			setIsOpen(true);
		}
	}, [debouncedQuery, value]);

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
			case "Tab":
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

	// Screen reader status message
	const statusMessage = isLoading
		? "Recherche en cours..."
		: isError
			? "Erreur de recherche"
			: results.length > 0
				? `${results.length} résultat${results.length > 1 ? "s" : ""} disponible${results.length > 1 ? "s" : ""}`
				: debouncedQuery.length >= 2
					? "Aucun résultat"
					: "";

	return (
		<div ref={containerRef} data-slot="location-autocomplete" className="relative">
			<div className="relative">
				<input
					ref={inputRef}
					id={id}
					type="text"
					role="combobox"
					aria-expanded={showDropdown}
					aria-autocomplete="list"
					aria-haspopup="listbox"
					aria-controls={`${id}-listbox`}
					aria-activedescendant={
						highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined
					}
					aria-busy={isLoading}
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
						"h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 pr-8 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
						className,
					)}
				/>
				{/* Right icon: spinner, clear button, or nothing */}
				<div className="absolute right-2 top-1/2 -translate-y-1/2">
					{isLoading && !value && (
						<Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
					)}
					{value && !disabled && (
						<button
							type="button"
							onClick={clearSelection}
							className="flex items-center justify-center size-6 -m-1 text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Effacer la localisation"
						>
							<XIcon className="size-4" />
						</button>
					)}
				</div>
			</div>

			{/* Screen reader live region */}
			<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
				{showDropdown ? statusMessage : ""}
			</div>

			{/* Dropdown */}
			{showDropdown && (
				<ul
					ref={listRef}
					id={`${id}-listbox`}
					role="listbox"
					className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-md"
				>
					{results.length > 0 &&
						results.map((loc, i) => (
							<li
								key={`${loc.city}-${loc.postcode}-${i}`}
								id={`${id}-option-${i}`}
								role="option"
								aria-selected={highlightedIndex === i}
								className={cn(
									"flex cursor-pointer items-center gap-2 px-3 min-h-[44px] text-sm transition-colors",
									highlightedIndex === i
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:bg-accent/50",
								)}
								onMouseDown={(e) => {
									e.preventDefault();
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
					{isLoading && results.length === 0 && (
						<li className="px-3 py-2.5 text-sm text-muted-foreground">Recherche...</li>
					)}
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

export { LocationAutocomplete };
