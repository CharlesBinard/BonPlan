export const ensureListView = (searchUrl: string): string => {
	try {
		const url = new URL(searchUrl);
		if (!url.searchParams.has("display_mode")) {
			url.searchParams.set("display_mode", "list");
		}
		return url.toString();
	} catch {
		return searchUrl;
	}
};
