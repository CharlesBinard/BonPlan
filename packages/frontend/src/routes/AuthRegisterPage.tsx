import { Loader2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerSchema } from "@/forms/schemas";
import { useAuth } from "@/providers/AuthProvider";

export const RegisterPage = () => {
	const { register: registerUser, isAuthenticated } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	if (isAuthenticated) return <Navigate to={from} replace />;

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		const result = registerSchema.safeParse({ name, email, password, confirmPassword });
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
		setSubmitting(true);
		try {
			await registerUser(name, email, password);
			navigate(from);
		} catch {
			setError("Impossible de créer le compte. Cet email est peut-être déjà utilisé.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4 animate-fade-in">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Créer un compte</CardTitle>
					<CardDescription>Rejoignez BonPlan et trouvez les meilleures affaires</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="name">Nom</Label>
							<Input
								id="name"
								type="text"
								placeholder="Votre nom"
								autoComplete="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
							{fieldErrors.name && <p className="text-xs text-destructive">{fieldErrors.name}</p>}
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="vous@exemple.fr"
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
							{fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="password">Mot de passe</Label>
							<Input
								id="password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
							{fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
							<Input
								id="confirmPassword"
								type="password"
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
							/>
							{fieldErrors.confirmPassword && <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>}
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<Button type="submit" disabled={submitting} className="w-full">
							{submitting && <Loader2Icon className="animate-spin" />}
							{submitting ? "Création…" : "Créer un compte"}
						</Button>

						<p className="text-center text-sm text-muted-foreground">
							Déjà un compte ?{" "}
							<Link to="/auth/login" className="text-primary underline underline-offset-4 hover:opacity-80">
								Se connecter
							</Link>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	);
};
