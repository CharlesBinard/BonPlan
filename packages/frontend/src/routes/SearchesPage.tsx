import {
	AlertCircleIcon,
	CheckCircle2Icon,
	EyeIcon,
	Loader2Icon,
	MapPinIcon,
	PlusIcon,
	SearchIcon,
	SlidersHorizontalIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { useCreateSearch, useSearches } from "@/api";
import { SearchCard } from "@/components/SearchCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { searchCreateSchema } from "@/forms/schemas";

// ── Reusable form field wrapper ──────────────────────────────────────
const FormField = ({
	label,
	htmlFor,
	required,
	error,
	valid,
	helpText,
	children,
}: {
	label: string;
	htmlFor?: string;
	required?: boolean;
	error?: string;
	valid?: boolean;
	helpText?: string;
	children: React.ReactNode;
}) => (
	<div className="flex flex-col gap-1.5">
		<Label htmlFor={htmlFor}>
			{label}
			{required && <span className="text-destructive ml-0.5">*</span>}
			{valid && !error && <CheckCircle2Icon className="inline size-3.5 ml-1.5 text-emerald-500" />}
		</Label>
		{children}
		{helpText && !error && <p className="text-[11px] text-muted-foreground">{helpText}</p>}
		{error && (
			<Alert variant="destructive" className="py-1.5 px-2">
				<AlertCircleIcon className="size-3.5" />
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		)}
	</div>
);

// ── Section header for grouped form fields ───────────────────────────
const SectionHeader = ({
	step,
	icon: Icon,
	title,
}: {
	step: number;
	icon: React.ComponentType<{ className?: string }>;
	title: string;
}) => (
	<div className="flex items-center gap-2">
		<span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
			{step}
		</span>
		<Icon className="size-3.5 text-muted-foreground" />
		<span className="text-sm font-medium">{title}</span>
	</div>
);

const SearchCreateDialog = () => {
	const createSearch = useCreateSearch();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [location, setLocation] = useState("");
	const [radiusKm, setRadiusKm] = useState("30");
	const [intervalMin, setIntervalMin] = useState("15");
	const [minScore, setMinScore] = useState("70");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [nationWide, setNationWide] = useState(false);
	const [allowBundles, setAllowBundles] = useState(false);

	const reset = () => {
		setQuery("");
		setLocation("");
		setRadiusKm("30");
		setIntervalMin("15");
		setMinScore("70");
		setFieldErrors({});
		setNationWide(false);
		setAllowBundles(false);
	};

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const result = searchCreateSchema.safeParse({
			query,
			location: nationWide ? "" : location,
			radiusKm: nationWide ? 30 : Number(radiusKm),
			intervalMin: Number(intervalMin),
			minScore: Number(minScore),
			allowBundles,
		});
		if (!result.success) {
			const errs: Record<string, string> = {};
			for (const issue of result.error.issues) {
				const key = issue.path[0] as string;
				if (!errs[key]) errs[key] = issue.message;
			}
			setFieldErrors(errs);
			return;
		}
		setFieldErrors({});
		await createSearch.mutateAsync({ data: result.data });
		reset();
		setOpen(false);
	};

	// Validation state
	const queryValid = query.length >= 3;
	const locationValid = nationWide || location.length > 0;
	const intervalNum = Number(intervalMin);
	const scoreNum = Number(minScore);
	const intervalValid = !Number.isNaN(intervalNum) && intervalNum >= 5 && intervalNum <= 1440;
	const scoreValid = !Number.isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= 100;
	const formValid = queryValid && locationValid && intervalValid && scoreValid;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button>
						<PlusIcon />
						Nouvelle recherche
					</Button>
				}
			/>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Nouvelle recherche</DialogTitle>
				</DialogHeader>
				<form onSubmit={onSubmit} className="flex flex-col gap-4">
					{/* ── Section 1: Recherche ─────────────────────── */}
					<SectionHeader step={1} icon={SearchIcon} title="Recherche" />

					<FormField
						label="Requete"
						htmlFor="query"
						required
						error={fieldErrors.query}
						valid={queryValid}
						helpText="Mots-cles pour la recherche (ex: iPhone 14 Pro, velo electrique)"
					>
						<Input
							id="query"
							placeholder="ex: iPhone 14 Pro"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					</FormField>

					{/* Nationwide toggle */}
					<div className="flex items-center gap-3">
						<Switch id="nationwide" checked={nationWide} onCheckedChange={(checked) => setNationWide(checked)} />
						<Label htmlFor="nationwide" className="flex items-center gap-1.5 cursor-pointer">
							<MapPinIcon className="size-3.5 text-muted-foreground" />
							Toute la France
						</Label>
					</div>

					{!nationWide && (
						<FormField
							label="Localisation"
							htmlFor="location"
							required
							error={fieldErrors.location}
							valid={location.length > 0}
							helpText="Ville ou code postal"
						>
							<Input
								id="location"
								placeholder="ex: Paris, Etampes..."
								value={location}
								onChange={(e) => setLocation(e.target.value)}
							/>
						</FormField>
					)}

					<Separator />

					{/* ── Section 2: Options ───────────────────────── */}
					<SectionHeader step={2} icon={SlidersHorizontalIcon} title="Options" />

					<div className={`grid gap-3 ${nationWide ? "grid-cols-2" : "grid-cols-3"}`}>
						{!nationWide && (
							<FormField label="Rayon (km)" htmlFor="radius" error={fieldErrors.radiusKm} helpText="1 - 500">
								<Input
									id="radius"
									type="number"
									min={1}
									max={500}
									value={radiusKm}
									onChange={(e) => setRadiusKm(e.target.value)}
								/>
							</FormField>
						)}
						<FormField
							label="Intervalle (min)"
							htmlFor="interval"
							error={fieldErrors.intervalMin}
							valid={intervalValid}
							helpText="Frequence de scraping"
						>
							<Input
								id="interval"
								type="number"
								min={5}
								max={1440}
								value={intervalMin}
								onChange={(e) => setIntervalMin(e.target.value)}
							/>
						</FormField>
						<FormField
							label="Score min"
							htmlFor="minScore"
							error={fieldErrors.minScore}
							valid={scoreValid}
							helpText="Seuil d'alerte (0-100)"
						>
							<Input
								id="minScore"
								type="number"
								min={0}
								max={100}
								value={minScore}
								onChange={(e) => setMinScore(e.target.value)}
							/>
						</FormField>
					</div>

					<div className="flex items-center gap-3">
						<Switch id="allowBundles" checked={allowBundles} onCheckedChange={(checked) => setAllowBundles(checked)} />
						<Label htmlFor="allowBundles" className="cursor-pointer">
							Autoriser les lots / bundles
						</Label>
					</div>

					<Separator />

					{/* ── Section 3: Preview ───────────────────────── */}
					<SectionHeader step={3} icon={EyeIcon} title="Apercu" />

					<div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1.5">
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground">Recherche :</span>
							<span className="font-medium">{query || "..."}</span>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-muted-foreground">Lieu :</span>
							<span className="font-medium">
								{nationWide ? "Toute la France" : location || "..."}
								{!nationWide && radiusKm && location && ` (${radiusKm} km)`}
							</span>
						</div>
						<div className="flex flex-wrap gap-1.5 mt-1">
							<Badge variant="secondary" className="text-[10px]">
								Toutes les {intervalMin} min
							</Badge>
							<Badge variant="secondary" className="text-[10px]">
								Score {"\u2265"} {minScore}
							</Badge>
							{allowBundles && (
								<Badge variant="secondary" className="text-[10px]">
									Lots inclus
								</Badge>
							)}
						</div>
					</div>

					<DialogFooter className="mt-2">
						<Button type="submit" disabled={createSearch.isPending || !formValid}>
							{createSearch.isPending && <Loader2Icon className="animate-spin" />}
							{createSearch.isPending ? "Creation..." : "Creer"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};

const SearchesPage = () => {
	const { data, isLoading } = useSearches();
	const searches = data?.searches ?? [];

	return (
		<div className="flex flex-col gap-6 animate-fade-in">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Mes recherches</h1>
				<SearchCreateDialog />
			</div>

			{isLoading ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: 3 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
						<Skeleton key={i} className="h-44 rounded-xl" />
					))}
				</div>
			) : searches.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
					<SearchIcon className="size-16 text-muted-foreground/20" />
					<div className="flex flex-col gap-1">
						<p className="font-medium text-muted-foreground">Aucune recherche</p>
						<p className="text-sm text-muted-foreground">
							Commencez par creer votre premiere recherche pour trouver les meilleures affaires.
						</p>
					</div>
					<SearchCreateDialog />
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{searches.map((search, index) => (
						<div key={search.id} className="animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
							<SearchCard search={search} />
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export const Component = SearchesPage;
