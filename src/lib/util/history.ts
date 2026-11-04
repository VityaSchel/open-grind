import { goto } from "$app/navigation";
import { navigating, page } from "$app/state";

import { liveHistoryIndex } from "#lib/util/history-index.ts";
import { historyLog } from "#lib/util/history-log.svelte.ts";

export const BACK_WATCHDOG_MS = 1000;

function trustedNavigation():
	| { navigation: Navigation; index: number }
	| undefined {
	const navigation = window.navigation;
	const index = navigation?.currentEntry?.index;
	if (!navigation || index === undefined || index < 0) return undefined;

	const current = liveHistoryIndex();
	if (
		current !== undefined &&
		navigation.entries().length < historyLog.span(current)
	)
		return undefined;
	return { navigation, index };
}

function entryPathname(url: string): string {
	return new URL(url).pathname || "/";
}

export function canGoBack(): boolean {
	void historyLog.recorded;
	const trusted = trustedNavigation();
	if (trusted) return trusted.navigation.canGoBack;

	const current = liveHistoryIndex();
	return current !== undefined && historyLog.hasEntryBefore(current);
}

export function earlierPathnames(): (string | null)[] {
	void historyLog.recorded;
	const trusted = trustedNavigation();
	if (trusted) {
		const { navigation, index } = trusted;
		return navigation
			.entries()
			.slice(0, index)
			.reverse()
			.map(({ url }) => (url ? entryPathname(url) : null));
	}

	const current = liveHistoryIndex();
	if (current === undefined) return [];
	return historyLog.earlier({ index: current, limit: history.length - 1 });
}

export function traverseBackTo(pathname: string): boolean {
	const steps = earlierPathnames().indexOf(pathname);
	if (steps < 0) return false;
	history.go(-(steps + 1));
	return true;
}

export function returnTo(pathname: string): void {
	if (!traverseBackTo(pathname)) void goto(pathname, { replace: true });
}

export function goBack({ parent }: { parent: string }): void {
	if (!canGoBack()) {
		returnTo(parent);
		return;
	}

	const from = location.href;
	const leaving = new AbortController();
	const left = () => leaving.abort();
	addEventListener("popstate", left, { signal: leaving.signal });
	addEventListener("pagehide", left, { signal: leaving.signal });
	setTimeout(() => {
		const stalled =
			!leaving.signal.aborted &&
			location.href === from &&
			navigating.type === null;
		leaving.abort();
		if (stalled) returnTo(parent);
	}, BACK_WATCHDOG_MS);
	history.back();
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
