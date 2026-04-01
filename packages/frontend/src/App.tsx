import { RouterProvider } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AppProviders } from "@/providers/AppProviders";
import { router } from "@/router";

export const App = () => (
	<AppProviders>
		<RouterProvider router={router} />
		<Toaster richColors position="top-right" />
	</AppProviders>
);
