export const routes = {
	dashboard: "/",
	searches: "/searches",
	searchDetail: (id: string) => `/searches/${id}`,
	listingDetail: (searchId: string, listingId: string) => `/searches/${searchId}/listings/${listingId}`,
	favorites: "/favorites",
	feed: "/feed",
	notifications: "/notifications",
	settings: "/settings",
	login: "/auth/login",
	register: "/auth/register",
};
