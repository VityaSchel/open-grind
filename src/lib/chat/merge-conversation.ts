import type { Conversation } from "$lib/model/messaging/conversations";
import { flagsOf } from "./conversation-flags";

export type ConversationFlagField = "pinned" | "muted";

export function mergeConversation({
	existing,
	incoming,
	pendingFlags,
	lastActivityAtFetchStart,
}: {
	existing: Conversation;
	incoming: Conversation;
	pendingFlags: Iterable<ConversationFlagField>;
	lastActivityAtFetchStart: number;
}): boolean {
	const data = { ...incoming.data };
	const keptLiveActivity =
		existing.data.lastActivityTimestamp > lastActivityAtFetchStart &&
		existing.data.lastActivityTimestamp > data.lastActivityTimestamp;
	if (keptLiveActivity) {
		Object.assign(data, {
			lastActivityTimestamp: existing.data.lastActivityTimestamp,
			preview: existing.data.preview,
			unreadCount: existing.data.unreadCount,
		});
	}
	for (const field of pendingFlags) data[field] = existing.data[field];
	if (incoming.type === "partial_conversation_v1") {
		Object.assign(data, flagsOf(existing.data));
	}
	existing.type = incoming.type;
	Object.assign(existing.data, data);
	return keptLiveActivity;
}
