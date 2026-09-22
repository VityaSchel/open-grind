import { navigating, page } from "$app/state";

export function canGoBack(): boolean {
	return window.navigation?.canGoBack ?? history.length > 1;
}

export function earlierPathnames(): (string | null)[] {
	const index = window.navigation?.currentEntry?.index;
	const entries = window.navigation?.entries();
	if (!entries || index === undefined || index < 1) return [];

	return entries
		.slice(0, index)
		.reverse()
		.map(({ url }) => (url ? new URL(url).pathname : null));
}

export function traverseBackTo(pathname: string): boolean {
	const steps = earlierPathnames().indexOf(pathname);
	if (steps < 0) return false;
	history.go(-(steps + 1));
	return true;
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
