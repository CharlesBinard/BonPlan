export const routes = {
	dashboard: "/",
	searches: "/searches",
	searchDetail: (id: string) => `/searches/${id}`,
	listingDetail: (searchId: string, listingId: string) => `/searches/${searchId}/listings/${listingId}`,
	searchCompare: (id: string) => `/searches/${id}/compare`,
	favorites: "/favorites",
	feed: "/feed",
	notifications: "/notifications",
	settings: "/settings",
	login: "/auth/login",
	register: "/auth/register",
};
