import { SearchStatus } from "@bonplan/shared/types";

export const statusColors: Record<string, string> = {
	[SearchStatus.Active]: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
	[SearchStatus.Paused]: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
	[SearchStatus.Pending]: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	[SearchStatus.Mapping]: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
	[SearchStatus.Blocked]: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export const statusLabels: Record<string, string> = {
	[SearchStatus.Active]: "Active",
	[SearchStatus.Paused]: "En pause",
	[SearchStatus.Pending]: "En attente",
	[SearchStatus.Mapping]: "Analyse en cours",
	[SearchStatus.Blocked]: "Bloquée",
};

export const statusBorderColors: Record<string, string> = {
	[SearchStatus.Active]: "border-l-green-500",
	[SearchStatus.Paused]: "border-l-gray-500",
	[SearchStatus.Pending]: "border-l-blue-500",
	[SearchStatus.Mapping]: "border-l-purple-500",
	[SearchStatus.Blocked]: "border-l-red-500",
};

export const statusDotColors: Record<string, string> = {
	[SearchStatus.Active]: "bg-green-500",
	[SearchStatus.Paused]: "bg-gray-400",
	[SearchStatus.Pending]: "bg-blue-500",
	[SearchStatus.Mapping]: "bg-purple-500",
	[SearchStatus.Blocked]: "bg-red-500",
};
