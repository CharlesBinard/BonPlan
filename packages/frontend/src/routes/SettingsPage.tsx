import {
	AI_MODELS,
	getDefaultModel,
	PROVIDER_LABELS,
	PROVIDER_VALUES,
	type ProviderType,
} from "@bonplan/shared/ai-models";
import {
	AlertCircleIcon,
	BellIcon,
	CheckCircle2Icon,
	CpuIcon,
	Loader2Icon,
	LockIcon,
	ShieldCheckIcon,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type UpdateSettingsBody, useChangePassword, useSettings, useUpdateSettings } from "@/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/config/api";
import { passwordChangeSchema } from "@/forms/schemas";

// ── Reusable form field wrapper with validation styling ──────────────
const FormField = ({
	label,
	htmlFor,
	required,
	error,
	valid,
	children,
}: {
	label: string;
	htmlFor?: string;
	required?: boolean;
	error?: string;
	valid?: boolean;
	children: React.ReactNode;
}) => (
	<div className="flex flex-col gap-1.5">
		<Label htmlFor={htmlFor}>
			{label}
			{required && <span className="text-destructive ml-0.5">*</span>}
			{valid && !error && <CheckCircle2Icon className="inline size-3.5 ml-1.5 text-emerald-500" />}
		</Label>
		{children}
		{error && (
			<Alert variant="destructive" className="py-1.5 px-2">
				<AlertCircleIcon className="size-3.5" />
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		)}
	</div>
);

// ── Password requirements checklist ──────────────────────────────────
const PasswordChecklist = ({ password }: { password: string }) => {
	const checks = [
		{ label: "8+ caractères", met: password.length >= 8 },
		{ label: "Contient une lettre", met: /[a-zA-Z]/.test(password) },
		{ label: "Contient un chiffre", met: /[0-9]/.test(password) },
	];

	if (!password) return null;

	return (
		<ul className="flex flex-col gap-0.5 mt-1">
			{checks.map((c) => (
				<li
					key={c.label}
					className={`flex items-center gap-1.5 text-xs ${c.met ? "text-emerald-600" : "text-muted-foreground"}`}
				>
					{c.met ? (
						<CheckCircle2Icon className="size-3" />
					) : (
						<span className="size-3 rounded-full border border-current inline-block" />
					)}
					{c.label}
				</li>
			))}
		</ul>
	);
};

// ── Provider card for visual selection ───────────────────────────────
const ProviderCard = ({
	provider,
	label,
	selected,
	onClick,
}: {
	provider: string;
	label: string;
	selected: boolean;
	onClick: () => void;
}) => (
	<button
		type="button"
		onClick={onClick}
		className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-all cursor-pointer ${
			selected
				? "border-primary bg-primary/5 text-primary shadow-sm"
				: "border-border bg-card text-muted-foreground hover:border-foreground/20 hover:bg-muted/50"
		}`}
	>
		<span className="text-xs font-semibold uppercase tracking-wide">{provider}</span>
		<span className="text-[11px] text-muted-foreground">{label}</span>
	</button>
);

// ── AI Config Tab ────────────────────────────────────────────────────
const AiConfigTab = () => {
	const { data, isLoading } = useSettings();
	const updateSettings = useUpdateSettings();
	const settings = data;

	const [selectedProvider, setSelectedProvider] = useState<string>("claude");
	const [selectedModel, setSelectedModel] = useState<string>("");
	const [apiKey, setApiKey] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [editingKey, setEditingKey] = useState(false);
	const [customInstructions, setCustomInstructions] = useState("");

	const initializedRef = useRef(false);
	useEffect(() => {
		if (settings && !initializedRef.current) {
			setSelectedProvider(settings.aiProvider);
			setSelectedModel(settings.aiModel ?? getDefaultModel(settings.aiProvider as ProviderType));
			setCustomInstructions(settings.aiCustomInstructions ?? "");
			initializedRef.current = true;
		}
	}, [settings]);

	if (isLoading || !settings) return <Skeleton className="h-64 w-full" />;

	const savedProvider = settings.aiProvider;
	const providerChanged = selectedProvider !== savedProvider;
	const models = AI_MODELS[selectedProvider as ProviderType] ?? [];
	const needsApiKey = providerChanged || !settings.hasApiKey || editingKey;

	const handleProviderChange = (value: string) => {
		setSelectedProvider(value);
		setSelectedModel(getDefaultModel(value as ProviderType));
		setApiKey("");
		setPassword("");
	};

	const handleSave = async () => {
		setError(null);
		const body: UpdateSettingsBody = {};
		if (selectedProvider !== savedProvider) body.aiProvider = selectedProvider as UpdateSettingsBody["aiProvider"];
		if (selectedModel !== settings.aiModel) body.aiModel = selectedModel;

		if (providerChanged && !apiKey) {
			setError("Une clé API est requise pour changer de fournisseur.");
			return;
		}

		if (apiKey) {
			if (!password) {
				setError("Mot de passe requis pour changer la clé API.");
				return;
			}
			body.aiApiKey = apiKey;
			body.currentPassword = password;
		}
		const trimmedInstructions = customInstructions.trim();
		const savedInstructions = settings.aiCustomInstructions ?? "";
		if (trimmedInstructions !== savedInstructions) {
			body.aiCustomInstructions = trimmedInstructions || null;
		}
		if (Object.keys(body).length === 0) return;
		try {
			await updateSettings.mutateAsync({ data: body });
			setApiKey("");
			setPassword("");
			setEditingKey(false);
			initializedRef.current = false;
		} catch (err) {
			if (err instanceof ApiError) {
				setError(typeof err.data?.error === "string" ? err.data.error : err.message);
			} else {
				setError("Erreur lors de la sauvegarde.");
			}
		}
	};

	const hasChanges =
		selectedProvider !== savedProvider ||
		selectedModel !== settings.aiModel ||
		apiKey.length > 0 ||
		customInstructions.trim() !== (settings.aiCustomInstructions ?? "");

	return (
		<Card>
			<CardHeader>
				<CardTitle>Configuration IA</CardTitle>
				<CardDescription>Choisissez votre fournisseur et modèle d'IA.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-5">
				{/* Provider visual cards */}
				<div className="flex flex-col gap-1.5">
					<Label>Fournisseur</Label>
					<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
						{PROVIDER_VALUES.map((p) => {
							const shortName =
								p === "claude" ? "Claude" : p === "openai" ? "OpenAI" : p === "gemini" ? "Gemini" : "MiniMax";
							return (
								<ProviderCard
									key={p}
									provider={shortName}
									label={PROVIDER_LABELS[p as ProviderType]}
									selected={selectedProvider === p}
									onClick={() => handleProviderChange(p)}
								/>
							);
						})}
					</div>
				</div>

				{/* Model select */}
				<div className="flex flex-col gap-1.5">
					<Label>Modèle</Label>
					<Select
						value={selectedModel}
						onValueChange={(v) => {
							if (v !== null) setSelectedModel(v);
						}}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectLabel>Rapide</SelectLabel>
								{models
									.filter((m) => m.tier === "fast")
									.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.label}
										</SelectItem>
									))}
							</SelectGroup>
							<SelectGroup>
								<SelectLabel>Équilibré</SelectLabel>
								{models
									.filter((m) => m.tier === "balanced")
									.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.label}
											{m.recommended ? " \u2605" : ""}
										</SelectItem>
									))}
							</SelectGroup>
							<SelectGroup>
								<SelectLabel>Premium</SelectLabel>
								{models
									.filter((m) => m.tier === "premium")
									.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.label}
										</SelectItem>
									))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>

				{/* API key status badge + field */}
				{!needsApiKey && settings.hasApiKey && (
					<div className="flex items-center gap-2">
						<Badge className="bg-emerald-100 text-emerald-700 border-0">
							<ShieldCheckIcon className="size-3" />
							Clé configurée
						</Badge>
						<span className="text-xs text-muted-foreground">{PROVIDER_LABELS[savedProvider as ProviderType]}</span>
						<Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setEditingKey(true)}>
							Modifier
						</Button>
					</div>
				)}

				{needsApiKey && (
					<div className="flex flex-col gap-1.5">
						{providerChanged && (
							<Alert className="py-1.5 px-2 border-amber-200 bg-amber-50 text-amber-800">
								<AlertCircleIcon className="size-3.5" />
								<AlertDescription>Vous changez de fournisseur. Une nouvelle clé API est requise.</AlertDescription>
							</Alert>
						)}
						<FormField label={`Clé API ${PROVIDER_LABELS[selectedProvider as ProviderType]}`} required>
							<Input
								type="password"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								placeholder="Entrez votre clé API"
							/>
						</FormField>
					</div>
				)}

				{apiKey && (
					<FormField label="Mot de passe actuel" required>
						<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
					</FormField>
				)}

				{/* Custom instructions */}
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="customInstructions">Instructions personnalisées pour l'IA</Label>
					<Textarea
						id="customInstructions"
						value={customInstructions}
						onChange={(e) => setCustomInstructions(e.target.value)}
						placeholder="Ex: Je suis bricoleur, les petits défauts cosmétiques ne me dérangent pas..."
						maxLength={500}
						rows={3}
					/>
					<p className="text-[11px] text-muted-foreground flex justify-between">
						<span>Ces instructions guident l'IA pour toutes vos recherches.</span>
						<span className="tabular-nums">{customInstructions.length}/500</span>
					</p>
				</div>

				{error && (
					<Alert variant="destructive">
						<AlertCircleIcon className="size-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<Button onClick={handleSave} disabled={updateSettings.isPending || !hasChanges}>
					{updateSettings.isPending && <Loader2Icon className="animate-spin" />}
					{updateSettings.isPending ? "Sauvegarde..." : "Sauvegarder"}
				</Button>
			</CardContent>
		</Card>
	);
};

// ── Notifications Tab ────────────────────────────────────────────────
const NotificationsTab = () => {
	const { data: settings, isLoading } = useSettings();
	const updateSettings = useUpdateSettings();
	const [webhookUrl, setWebhookUrl] = useState("");
	const [minScore, setMinScore] = useState("70");
	const [testing, setTesting] = useState(false);

	useEffect(() => {
		if (settings) {
			setWebhookUrl(settings.defaultWebhookUrl ?? "");
			setMinScore(String(settings.defaultMinScore ?? 70));
		}
	}, [settings]);

	if (isLoading) return <Skeleton className="h-64 w-full" />;

	const handleSave = async () => {
		await updateSettings.mutateAsync({
			data: {
				defaultWebhookUrl: webhookUrl || null,
				defaultMinScore: Number(minScore) || null,
			},
		});
	};

	const handleTest = async () => {
		if (!webhookUrl) return;
		setTesting(true);
		try {
			await api("/api/settings/webhook-test", { method: "POST", body: { url: webhookUrl } });
			toast.success("Test réussi ! Vérifiez la réception.");
		} catch (err) {
			toast.error(err instanceof ApiError ? (err.data.error as string) : "Erreur lors du test");
		} finally {
			setTesting(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notifications Webhook</CardTitle>
				<CardDescription>URL par défaut pour les nouvelles recherches. Compatible Discord webhook.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="defaultWebhookUrl">URL Webhook</Label>
					<div className="flex gap-2">
						<Input
							id="defaultWebhookUrl"
							placeholder="https://discord.com/api/webhooks/..."
							value={webhookUrl}
							onChange={(e) => setWebhookUrl(e.target.value)}
							className="flex-1"
						/>
						<Button variant="outline" size="sm" onClick={handleTest} disabled={!webhookUrl || testing}>
							{testing ? <Loader2Icon className="animate-spin size-4" /> : "Tester"}
						</Button>
					</div>
					<p className="text-[11px] text-muted-foreground">
						Discord webhook (discord.com/api/webhooks/...) ou URL custom HTTPS
					</p>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="defaultMinScore">Score minimum par défaut</Label>
					<Input
						id="defaultMinScore"
						type="number"
						min={0}
						max={100}
						value={minScore}
						onChange={(e) => setMinScore(e.target.value)}
					/>
					<p className="text-[11px] text-muted-foreground">Seuil de notification (0-100)</p>
				</div>
				<Button onClick={handleSave} disabled={updateSettings.isPending}>
					{updateSettings.isPending && <Loader2Icon className="animate-spin" />}
					Sauvegarder
				</Button>
			</CardContent>
		</Card>
	);
};

// ── Password Tab ─────────────────────────────────────────────────────
const PasswordTab = () => {
	const changePassword = useChangePassword();

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const result = passwordChangeSchema.safeParse({
			currentPassword,
			newPassword,
			confirmPassword,
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
		await changePassword.mutateAsync({ data: { currentPassword, newPassword } });
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
	};

	const pwValid = newPassword.length >= 8 && /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
	const confirmValid = confirmPassword.length > 0 && confirmPassword === newPassword;
	const formValid = currentPassword.length > 0 && pwValid && confirmValid;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Mot de passe</CardTitle>
				<CardDescription>Modifiez votre mot de passe de connexion.</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-3">
					<FormField
						label="Mot de passe actuel"
						htmlFor="currentPwd"
						required
						error={fieldErrors.currentPassword}
						valid={currentPassword.length > 0}
					>
						<Input
							id="currentPwd"
							type="password"
							autoComplete="current-password"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
						/>
					</FormField>

					<FormField
						label="Nouveau mot de passe"
						htmlFor="newPwd"
						required
						error={fieldErrors.newPassword}
						valid={pwValid}
					>
						<Input
							id="newPwd"
							type="password"
							autoComplete="new-password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
						/>
						<PasswordChecklist password={newPassword} />
					</FormField>

					<FormField
						label="Confirmer le nouveau mot de passe"
						htmlFor="confirmPwd"
						required
						error={fieldErrors.confirmPassword}
						valid={confirmValid}
					>
						<Input
							id="confirmPwd"
							type="password"
							autoComplete="new-password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
						/>
					</FormField>

					<Button type="submit" disabled={changePassword.isPending || !formValid} className="w-fit">
						{changePassword.isPending && <Loader2Icon className="animate-spin" />}
						{changePassword.isPending ? "Modification..." : "Modifier le mot de passe"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
};

// ── Main Settings Page ───────────────────────────────────────────────
const SettingsPage = () => (
	<div className="flex flex-col gap-6 animate-fade-in">
		<h1 className="text-xl font-semibold">Paramètres</h1>
		<Tabs defaultValue="ai-config">
			<TabsList className="w-full sm:w-auto">
				<TabsTrigger value="ai-config">
					<CpuIcon className="size-4" />
					Configuration IA
				</TabsTrigger>
				<TabsTrigger value="notifications">
					<BellIcon className="size-4" />
					Notifications
				</TabsTrigger>
				<TabsTrigger value="password">
					<LockIcon className="size-4" />
					Mot de passe
				</TabsTrigger>
			</TabsList>
			<TabsContent value="ai-config">
				<AiConfigTab />
			</TabsContent>
			<TabsContent value="notifications">
				<NotificationsTab />
			</TabsContent>
			<TabsContent value="password">
				<PasswordTab />
			</TabsContent>
		</Tabs>
	</div>
);

export const Component = SettingsPage;
