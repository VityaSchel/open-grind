import { afterNavigate, beforeNavigate } from "$app/navigation";
import { page } from "$app/state";

import { registerAccountCache } from "$lib/api/account-caches";
import { returnTo } from "$lib/util/history";

const deletedPages = new Set<string>();

registerAccountCache({ reset: () => deletedPages.clear() });

function pageKey(pathname: string): string {
	try {
		return decodeURIComponent(pathname);
	} catch {
		return pathname;
	}
}

function isDeleted(pathname: string): boolean {
	return deletedPages.has(pageKey(pathname));
}

export function leaveDeletedPages({
	pathnames,
	parent,
}: {
	pathnames: string[];
	parent: string;
}): void {
	for (const pathname of pathnames) deletedPages.add(pageKey(pathname));
	if (isDeleted(page.url.pathname)) returnTo(parent);
}

export function guardDeletedPages(): void {
	beforeNavigate((navigation) => {
		if (navigation.type !== "popstate" || navigation.delta < 1) return;
		if (navigation.to && isDeleted(navigation.to.url.pathname))
			navigation.cancel();
	});
	afterNavigate(({ to }) => {
		if (to) deletedPages.delete(pageKey(to.url.pathname));
	});
}
