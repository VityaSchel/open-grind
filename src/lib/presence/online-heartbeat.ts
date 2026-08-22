import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
import {
	getPreferencesSnapshot,
	preferencesLoaded,
} from "$lib/app-data/preferences.svelte";
import { gridState } from "$lib/grid/grid-state.svelte";
import { now } from "$lib/util/clock";
import { onlineRefreshedAt } from "./online-clock";

export const ONLINE_WINDOW_MS = 10 * 60 * 1000;
const ONLINE_REFRESH_MARGIN_MS = 3 * 60 * 1000;
export const ONLINE_REFRESH_AFTER_MS =
	ONLINE_WINDOW_MS - ONLINE_REFRESH_MARGIN_MS;
const TICK_MS = 60 * 1000;

export async function beatOnlinePresence(): Promise<void> {
	if (typeof document !== "undefined" && document.hidden) return;
	if (!appLifecycle.active) return;
	if (!preferencesLoaded()) return;
	if (!getPreferencesSnapshot().stayOnline && !gridState.viewActive) return;
	const refreshedAt = onlineRefreshedAt();
	if (refreshedAt !== null && now() - refreshedAt < ONLINE_REFRESH_AFTER_MS)
		return;
	await gridState.refresh({ background: true });
}

export function startOnlineHeartbeat(): () => void {
	const timer = setInterval(() => void beatOnlinePresence(), TICK_MS);
	return () => clearInterval(timer);
}
