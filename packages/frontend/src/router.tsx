import { createBrowserRouter, Navigate, Outlet, useLocation } from "react-router-dom";
import { AppLayout } from "@/components/Layout/AppLayout";
import { useAuth } from "@/providers/AuthProvider";

// Eagerly loaded (critical path)
import { LoginPage } from "@/routes/AuthLoginPage";
import { RegisterPage } from "@/routes/AuthRegisterPage";
import { DashboardPage } from "@/routes/DashboardPage";

/** Wrap lazy imports to auto-reload on stale chunk errors after a redeploy */
const lazyLoad = (importFn: () => Promise<Record<string, unknown>>) => async () => {
	try {
		return await importFn();
	} catch (err) {
		if (err instanceof TypeError && err.message.includes("dynamically imported module")) {
			window.location.reload();
			return { Component: () => null }; // unreachable, keeps TS happy
		}
		throw err;
	}
};

const ProtectedRoute = () => {
	const { isAuthenticated, isLoading, isError } = useAuth();
	const location = useLocation();

	if (isLoading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

	if (isError)
		return (
			<div className="flex h-screen items-center justify-center">
				Erreur de connexion.{" "}
				<button type="button" onClick={() => window.location.reload()} className="ml-2 underline">
					Réessayer
				</button>
			</div>
		);

	if (!isAuthenticated) return <Navigate to="/auth/login" replace state={{ from: location }} />;

	return (
		<AppLayout>
			<Outlet />
		</AppLayout>
	);
};

export const router = createBrowserRouter([
	{ path: "/auth/login", element: <LoginPage /> },
	{ path: "/auth/register", element: <RegisterPage /> },
	{
		element: <ProtectedRoute />,
		children: [
			{ path: "/", element: <DashboardPage /> },
			// Lazy-loaded pages: each module exports { Component }
			{ path: "/searches", lazy: lazyLoad(() => import("@/routes/SearchesPage")) },
			{ path: "/searches/:id", lazy: lazyLoad(() => import("@/routes/SearchDetailPage")) },
			{ path: "/searches/:id/compare", lazy: lazyLoad(() => import("@/routes/ComparePage")) },
			{ path: "/searches/:id/listings/:listingId", lazy: lazyLoad(() => import("@/routes/ListingDetailPage")) },
			{ path: "/favorites", lazy: lazyLoad(() => import("@/routes/FavoritesPage")) },
			{ path: "/feed", lazy: lazyLoad(() => import("@/routes/FeedPage")) },
			{ path: "/notifications", lazy: lazyLoad(() => import("@/routes/NotificationsPage")) },
			{ path: "/settings", lazy: lazyLoad(() => import("@/routes/SettingsPage")) },
		],
	},
	{
		path: "*",
		element: <div className="flex h-screen items-center justify-center text-2xl">404 — Page non trouvée</div>,
	},
]);
