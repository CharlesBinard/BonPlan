import { NotificationChannel, NotificationStatus } from "@bonplan/shared/types";
import { BellIcon, BellOffIcon, Loader2Icon, MessageSquareIcon, WebhookIcon } from "lucide-react";
import { useState } from "react";
import { type NotificationResponse, useNotifications } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
	[NotificationStatus.Sent]: "bg-green-100 text-green-700 border-0",
	[NotificationStatus.Failed]: "bg-red-100 text-red-700 border-0",
	[NotificationStatus.Pending]: "bg-yellow-100 text-yellow-700 border-0",
};

const statusLabels: Record<string, string> = {
	[NotificationStatus.Sent]: "Envoyée",
	[NotificationStatus.Failed]: "Échouée",
	[NotificationStatus.Pending]: "En attente",
};

const ChannelIcon = ({ channel }: { channel: string }) => {
	if (channel === NotificationChannel.Discord) {
		return <MessageSquareIcon className="size-4 text-indigo-500" />;
	}
	return <WebhookIcon className="size-4 text-blue-500" />;
};

const formatDateTime = (dateStr: string): string => {
	return new Date(dateStr).toLocaleString("fr-FR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
};

type FilterStatus = "all" | "sent" | "failed";

const NotificationsPage = () => {
	const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

	const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(
		filterStatus !== "all" ? { status: filterStatus } : undefined,
	);

	const notifications: NotificationResponse[] = data?.pages.flatMap((p) => p.notifications) ?? [];

	const filterButtons: { value: FilterStatus; label: string }[] = [
		{ value: "all", label: "Toutes" },
		{ value: "sent", label: "Envoyées" },
		{ value: "failed", label: "Échouées" },
	];

	return (
		<div className="flex flex-col gap-6 animate-fade-in">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Notifications</h1>
				<BellIcon className="size-5 text-muted-foreground" />
			</div>

			{/* Filter buttons */}
			<div className="flex gap-2">
				{filterButtons.map((btn) => (
					<Button
						key={btn.value}
						size="sm"
						variant={filterStatus === btn.value ? "default" : "outline"}
						onClick={() => setFilterStatus(btn.value)}
					>
						{btn.label}
					</Button>
				))}
			</div>

			{/* Notification list */}
			{isLoading ? (
				<div className="flex flex-col gap-3">
					{Array.from({ length: 5 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder
						<Skeleton key={i} className="h-16 rounded-xl" />
					))}
				</div>
			) : notifications.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
					<BellOffIcon className="size-16 text-muted-foreground/20" />
					<div className="flex flex-col gap-1">
						<p className="font-medium text-muted-foreground">Aucune notification</p>
						<p className="text-sm text-muted-foreground">
							Les notifications apparaitront ici lorsque de bonnes affaires seront detectees.
						</p>
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					{notifications.map((notif, index) => (
						<div
							key={notif.id}
							className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 animate-slide-up"
							style={{ animationDelay: `${index * 50}ms` }}
						>
							<ChannelIcon channel={notif.channel} />
							<div className="flex flex-1 flex-col gap-0.5 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium capitalize">
										{notif.channel === NotificationChannel.Discord ? "Discord" : "Webhook"}
									</span>
									<Badge
										className={cn("text-xs", statusColors[notif.status] ?? "bg-muted text-muted-foreground border-0")}
									>
										{statusLabels[notif.status] ?? notif.status}
									</Badge>
								</div>
								{notif.error && <p className="truncate text-xs text-red-500">{notif.error}</p>}
							</div>
							<span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(notif.createdAt)}</span>
						</div>
					))}
				</div>
			)}

			{/* Load more */}
			{hasNextPage && (
				<div className="flex justify-center">
					<Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
						{isFetchingNextPage && <Loader2Icon className="animate-spin" />}
						{isFetchingNextPage ? "Chargement…" : "Charger plus"}
					</Button>
				</div>
			)}
		</div>
	);
};

export const Component = NotificationsPage;
