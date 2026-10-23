import { afterNavigate, beforeNavigate } from "$app/navigation";
import { page } from "$app/state";

import { registerAccountCache } from "$lib/api/account-caches";
import { earlierPathnames, returnTo } from "$lib/util/history";

const parentsOfDeleted = new Map<string, string>();

registerAccountCache({ reset: () => parentsOfDeleted.clear() });

function pageKey(pathname: string): string {
	try {
		return decodeURIComponent(pathname);
	} catch {
		return pathname;
	}
}

function isDeleted(pathname: string | null): boolean {
	return pathname !== null && parentsOfDeleted.has(pageKey(pathname));
}

export function leaveDeletedPages({
	pathnames,
	parent,
}: {
	pathnames: string[];
	parent: string;
}): void {
	for (const pathname of pathnames)
		parentsOfDeleted.set(pageKey(pathname), parent);
	if (isDeleted(page.url.pathname)) returnTo(parent);
}

function skipBackPast({
	delta,
	parent,
}: {
	delta: number;
	parent: string;
}): () => void {
	if (!window.navigation) return () => history.go(delta - 1);

	const steps = earlierPathnames().findIndex(
		(pathname) => !isDeleted(pathname),
	);
	if (steps < 0) return () => returnTo(parent);
	return () => history.go(delta - steps - 1);
}

function onceReverted(skip: () => void): void {
	addEventListener(
		"popstate",
		() => {
			if (location.pathname === page.url.pathname) skip();
		},
		{ once: true },
	);
}

export function guardDeletedPages(): void {
	beforeNavigate((navigation) => {
		if (navigation.type !== "popstate" || !navigation.to) return;
		const parent = parentsOfDeleted.get(
			pageKey(navigation.to.url.pathname),
		);
		if (parent === undefined) return;

		navigation.cancel();
		if (navigation.delta < 0)
			onceReverted(skipBackPast({ delta: navigation.delta, parent }));
	});
	afterNavigate(({ to }) => {
		if (to) parentsOfDeleted.delete(pageKey(to.url.pathname));
	});
}
