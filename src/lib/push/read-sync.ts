import { requestInboxResync } from "$lib/chat/inbox-resync";
import { windowFocused } from "$lib/platform/window-focus";
import { shownPushConversations } from "./index";

const AWAY_RECHECK_MS = 2 * 60 * 1000;
const MIN_RESYNC_GAP_MS = 30 * 1000;

let lastResyncAt = Number.NEGATIVE_INFINITY;

export async function resyncWhileShown(): Promise<void> {
	if (Date.now() - lastResyncAt < MIN_RESYNC_GAP_MS) return;
	const shown = await shownPushConversations().catch((error: unknown) => {
		console.error("Failed to list the shown chat notifications", error);
		return [];
	});
	if (shown.length === 0) return;
	lastResyncAt = Date.now();
	requestInboxResync();
}

export function recheckReadsWhileAway(): () => void {
	const timer = setInterval(() => {
		if (!windowFocused()) void resyncWhileShown();
	}, AWAY_RECHECK_MS);
	return () => clearInterval(timer);
}
