import { Bell, Heart, Home, Rss, Search, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { routes } from "@/constants/routes";

const tabs = [
	{ label: "Accueil", icon: Home, to: routes.dashboard },
	{ label: "Recherches", icon: Search, to: routes.searches },
	{ label: "Feed", icon: Rss, to: routes.feed },
	{ label: "Favoris", icon: Heart, to: routes.favorites },
	{ label: "Notifs", icon: Bell, to: routes.notifications, badge: true },
	{ label: "Paramètres", icon: Settings, to: routes.settings },
];

export const MobileNav = () => (
	<nav className="flex border-t border-border/60 bg-background">
		{tabs.map(({ label, icon: Icon, to, badge }) => (
			<NavLink
				key={to}
				to={to}
				end={to === routes.dashboard}
				className={({ isActive }) =>
					`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 px-1 text-[11px] font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
						isActive ? "text-primary" : "text-muted-foreground"
					}`
				}
			>
				{({ isActive }) => (
					<>
						<div className="relative">
							{isActive && <div className="absolute inset-0 -m-1.5 rounded-lg bg-primary/12" />}
							<Icon
								className={`relative h-5 w-5 ${isActive ? "text-primary" : ""}`}
								fill={isActive ? "currentColor" : "none"}
								strokeWidth={isActive ? 1.5 : 2}
							/>
							{badge && (
								<span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
							)}
						</div>
						<span className={isActive ? "text-primary" : ""}>{label}</span>
					</>
				)}
			</NavLink>
		))}
	</nav>
);
