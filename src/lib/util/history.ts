import { navigating, page } from "$app/state";

export function canGoBack(): boolean {
	return window.navigation?.canGoBack ?? history.length > 1;
}

export function traverseBackTo(pathname: string): boolean {
	const index = window.navigation?.currentEntry?.index;
	const entries = window.navigation?.entries();
	if (!entries || index === undefined || index < 1) return false;

	for (let i = index - 1; i >= 0; i--) {
		const url = entries[i]?.url;
		if (!url || new URL(url).pathname !== pathname) continue;
		history.go(i - index);
		return true;
	}
	return false;
}

export function previousEntryPathname(): string | null {
	const index = window.navigation?.currentEntry?.index;
	if (index === undefined || index < 1) return null;
	const url = window.navigation?.entries()[index - 1]?.url;
	return url ? new URL(url).pathname : null;
}

export function navigationPending({
	owns,
}: {
	owns: (pathname: string) => boolean;
}): boolean {
	if (navigating.type === "popstate") return true;
	const target = navigating.to?.url.pathname;
	if (target !== undefined && !owns(target)) return true;
	return (
		location.pathname !== page.url.pathname && location.pathname !== target
	);
}
