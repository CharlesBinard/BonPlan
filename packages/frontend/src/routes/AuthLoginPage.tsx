import { Loader2Icon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema } from "@/forms/schemas";
import { useAuth } from "@/providers/AuthProvider";

export const LoginPage = () => {
	const { login, isAuthenticated } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	if (isAuthenticated) return <Navigate to={from} replace />;

	const onSubmit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		const result = loginSchema.safeParse({ email, password });
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
			await login(email, password);
			navigate(from);
		} catch {
			setError("Email ou mot de passe incorrect.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4 animate-fade-in">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Connexion</CardTitle>
					<CardDescription>Connectez-vous à votre compte BonPlan</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit} className="flex flex-col gap-4">
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
								autoComplete="current-password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
							/>
							{fieldErrors.password && <p className="text-xs text-destructive">{fieldErrors.password}</p>}
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						<Button type="submit" disabled={submitting} className="w-full">
							{submitting && <Loader2Icon className="animate-spin" />}
							{submitting ? "Connexion…" : "Se connecter"}
						</Button>

						<p className="text-center text-sm text-muted-foreground">
							Pas de compte ?{" "}
							<Link to="/auth/register" className="text-primary underline underline-offset-4 hover:opacity-80">
								S'inscrire
							</Link>
						</p>
					</form>
				</CardContent>
			</Card>
		</div>
	);
};
