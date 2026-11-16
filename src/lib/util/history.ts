import { goto } from "$app/navigation";
import { navigating, page } from "$app/state";

import { liveHistoryIndex } from "#lib/util/history-index.ts";
import { historyLog } from "#lib/util/history-log.svelte.ts";
import { entryPathname } from "#lib/util/pathname.ts";

const BACK_WATCHDOG_MS = 1000;

function navigationEntriesBehind(): NavigationHistoryEntry[] | undefined {
	const navigation = window.navigation;
	const index = navigation?.currentEntry?.index;
	if (!navigation || index === undefined || index < 0) return undefined;

	const entries = navigation.entries();
	const current = liveHistoryIndex();
	if (current !== undefined && entries.length < historyLog.span(current))
		return undefined;
	return entries.slice(0, index);
}

export function canGoBack(): boolean {
	return earlierPathnames().length > 0;
}

export function earlierPathnames(): (string | null)[] {
	void historyLog.recorded;
	const behind = navigationEntriesBehind();
	if (behind)
		return behind
			.reverse()
			.map(({ url }) => (url ? entryPathname(url) : null));

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

export function goBack({ fallback }: { fallback: string }): void {
	if (!canGoBack()) {
		returnTo(fallback);
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
		if (stalled) returnTo(fallback);
	}, BACK_WATCHDOG_MS);
	history.back();
}

export class BackWatchdog {
	#timer: ReturnType<typeof setTimeout> | undefined;

	back({ stalled }: { stalled: () => void }): void {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(stalled, BACK_WATCHDOG_MS);
		history.back();
	}

	cancel(): void {
		clearTimeout(this.#timer);
	}
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
