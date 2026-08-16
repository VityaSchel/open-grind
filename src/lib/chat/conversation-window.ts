import {
	getConversations,
	type InboxFilterRequest,
} from "$lib/api/messaging/conversations";
import type { Conversation } from "$lib/model/messaging/conversations";

const MAX_PAGES = 100;

export async function fetchConversationWindow({
	oldestLoadedTs,
	filters = null,
}: {
	oldestLoadedTs: number;
	filters?: InboxFilterRequest | null;
}): Promise<{
	fetched: Map<string, Conversation>;
	oldestFetchedTs: number;
	reachedEnd: boolean;
	nextPage: number | null;
}> {
	const fetched = new Map<string, Conversation>();
	let oldestFetchedTs = Number.POSITIVE_INFINITY;
	let page: number | null = 1;
	let reachedEnd = false;
	for (let guard = 0; page !== null && guard < MAX_PAGES; guard++) {
		const currentPage: number = page;
		const result = await getConversations({ page: currentPage, filters });
		for (const entry of result.entries) {
			if (!fetched.has(entry.data.conversationId)) {
				fetched.set(entry.data.conversationId, entry);
			}
			oldestFetchedTs = Math.min(
				oldestFetchedTs,
				entry.data.lastActivityTimestamp,
			);
		}
		page = result.nextPage;
		if (page === null) {
			reachedEnd = true;
			break;
		}
		if (oldestFetchedTs <= oldestLoadedTs) break;
	}
	return { fetched, oldestFetchedTs, reachedEnd, nextPage: page };
}
