import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { setApiQueryClient } from "@/config/api";
import { setApiQueryClient as setMutatorQueryClient } from "@/config/api-mutator";
import { AuthProvider } from "./AuthProvider";
import { WebSocketProvider } from "./WebSocketProvider";

const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// Wire 401 handler so expired sessions auto-logout
setApiQueryClient(queryClient);
setMutatorQueryClient(queryClient);

export const AppProviders = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={queryClient}>
		<AuthProvider>
			<WebSocketProvider>{children}</WebSocketProvider>
		</AuthProvider>
	</QueryClientProvider>
);
