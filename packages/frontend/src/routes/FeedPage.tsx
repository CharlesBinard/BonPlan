import type { WsMessage } from "@bonplan/shared/types";
import { RssIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFeed } from "@/api";
import { ScoreBar } from "@/components/ScoreBar";

const formatRelativeTime = (dateStr?: string): string => {
	if (!dateStr) return "";
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "À l'instant";
	if (mins < 60) return `il y a ${mins} min`;
	const hours = Math.floor(mins / 60);
	return `il y a ${hours} h`;
};

type AnalyzedMessage = Extract<WsMessage, { type: "listing.analyzed" }> & {
	_receivedAt?: string;
	title?: string;
	location?: string;
};

const FeedPage = () => {
	const navigate = useNavigate();
	const { data: messages } = useFeed();

	const analyzedMessages = (messages ?? []).filter((m): m is AnalyzedMessage => m.type === "listing.analyzed");

	if (analyzedMessages.length === 0) {
		return (
			<div className="flex flex-col gap-6 animate-fade-in">
				<h1 className="text-xl font-semibold">Fil en direct</h1>
				<div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
					<RssIcon className="size-16 text-muted-foreground/20" />
					<div className="flex flex-col gap-1">
						<p className="font-medium text-muted-foreground">En attente de nouvelles annonces</p>
						<p className="text-sm text-muted-foreground">Les annonces analysees apparaitront ici automatiquement.</p>
					</div>
					<div className="flex items-center gap-2">
						<span className="size-2 animate-pulse rounded-full bg-green-500" />
						<span className="text-xs text-muted-foreground">Connexion en temps reel active</span>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 animate-fade-in">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Fil en direct</h1>
				<div className="flex items-center gap-1.5">
					<span className="size-2 animate-pulse rounded-full bg-green-500" />
					<span className="text-xs text-muted-foreground">{analyzedMessages.length} annonces</span>
				</div>
			</div>

			<div className="flex flex-col gap-3">
				{analyzedMessages.map((msg, index) => (
					<button
						type="button"
						key={msg.listingId}
						onClick={() => navigate(`/searches/${msg.searchId}/listings/${msg.listingId}`)}
						className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 animate-slide-up"
						style={{ animationDelay: `${index * 50}ms` }}
					>
						<div className="flex flex-1 flex-col gap-1 min-w-0">
							<p className="truncate text-sm font-medium">{msg.title ?? `Annonce ${msg.listingId.slice(0, 8)}`}</p>
							{msg.verdict && <p className="truncate text-xs text-muted-foreground">{msg.verdict}</p>}
							{msg.location && <p className="text-xs text-muted-foreground">{msg.location}</p>}
						</div>
						<div className="flex flex-col items-end gap-1 shrink-0">
							<ScoreBar score={msg.score} />
							{msg._receivedAt && (
								<span className="text-xs text-muted-foreground">{formatRelativeTime(msg._receivedAt)}</span>
							)}
						</div>
					</button>
				))}
			</div>
		</div>
	);
};

export const Component = FeedPage;
