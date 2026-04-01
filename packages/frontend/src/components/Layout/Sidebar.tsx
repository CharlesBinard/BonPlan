import { Bell, Heart, Home, LogOut, Rss, Search, Settings, Zap } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { routes } from "@/constants/routes";
import { useAuth } from "@/providers/AuthProvider";

const navItems = [
	{ label: "Accueil", icon: Home, to: routes.dashboard },
	{ label: "Recherches", icon: Search, to: routes.searches },
	{ label: "Feed", icon: Rss, to: routes.feed },
	{ label: "Favoris", icon: Heart, to: routes.favorites },
	{ label: "Notifications", icon: Bell, to: routes.notifications },
	{ label: "Paramètres", icon: Settings, to: routes.settings },
];

export const Sidebar = () => {
	const { user, logout } = useAuth();

	return (
		<aside className="flex h-full w-60 flex-col border-r bg-background">
			{/* Branding */}
			<div className="flex items-center gap-2 px-5 py-5">
				<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
					<Zap className="h-4.5 w-4.5 text-primary" />
				</div>
				<h1 className="text-lg font-bold tracking-tight text-foreground">BonPlan</h1>
			</div>

			{/* Navigation */}
			<nav className="flex-1 space-y-0.5 px-3 py-2">
				{navItems.map(({ label, icon: Icon, to }) => (
					<NavLink
						key={to}
						to={to}
						end={to === routes.dashboard}
						className={({ isActive }) =>
							`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
								isActive
									? "border-l-4 border-primary bg-primary/12 text-primary"
									: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							}`
						}
					>
						<Icon className="h-5 w-5 shrink-0" />
						{label}
					</NavLink>
				))}
			</nav>

			{/* Separator + Logout */}
			<div className="border-t border-border/60 p-3">
				<div className="mb-2 px-3 text-xs text-muted-foreground truncate">{user?.email}</div>
				<Button
					variant="ghost"
					size="sm"
					className="w-full justify-start gap-3 rounded-lg text-muted-foreground transition-all duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
					onClick={() => logout()}
				>
					<LogOut className="h-5 w-5 shrink-0" />
					Déconnexion
				</Button>
			</div>
		</aside>
	);
};
