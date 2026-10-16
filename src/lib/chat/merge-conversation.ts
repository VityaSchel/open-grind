import type { Conversation } from "$lib/model/messaging/conversations";
import { flagsOf } from "./conversation-flags";

export type ConversationFlagField = "pinned" | "muted";

export function mergeConversation({
	existing,
	incoming,
	pendingFlags,
}: {
	existing: Conversation;
	incoming: Conversation;
	pendingFlags: Iterable<ConversationFlagField>;
}): void {
	const data = { ...incoming.data };
	for (const field of pendingFlags) data[field] = existing.data[field];
	if (incoming.type === "partial_conversation_v1") {
		Object.assign(data, flagsOf(existing.data));
	}
	existing.type = incoming.type;
	Object.assign(existing.data, data);
}
