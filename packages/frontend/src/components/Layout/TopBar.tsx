import { Zap } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useWebSocket } from "@/providers/WebSocketProvider";

function getInitial(user: { name: string; email: string } | null): string {
	if (!user) return "?";
	if (user.name) return user.name.charAt(0).toUpperCase();
	return user.email.charAt(0).toUpperCase();
}

export const TopBar = () => {
	const { isConnected } = useWebSocket();
	const { user } = useAuth();

	return (
		<header className="flex h-14 items-center justify-between border-b border-border/60 bg-background px-4 shadow-sm">
			<div className="flex items-center gap-1.5">
				<Zap className="h-4.5 w-4.5 text-primary" />
				<span className="text-base font-bold tracking-tight text-foreground">BonPlan</span>
			</div>
			<div className="flex items-center gap-3">
				<span
					className={`inline-block h-2.5 w-2.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-muted"}`}
					title={isConnected ? "Connecté en temps réel" : "Déconnecté"}
					aria-label={isConnected ? "Connecté en temps réel" : "Déconnecté"}
					role="status"
				/>
				<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
					{getInitial(user)}
				</div>
			</div>
		</header>
	);
};
