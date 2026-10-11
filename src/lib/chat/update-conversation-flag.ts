import { applyOptimisticBatch } from "$lib/chat/optimistic-batch";
import type { ConversationFlagField } from "$lib/chat/merge-conversation";
import type { Conversation } from "$lib/model/messaging/conversations";
import type { PendingFlags } from "./pending-flags";

export type ConversationFlagUpdate = {
	field: ConversationFlagField;
	value: boolean;
	request: (conversationId: string) => Promise<unknown>;
	errorLabel: string;
};

export async function updateConversationFlag({
	entries,
	field,
	value,
	request,
	errorLabel,
	pendingFlags,
	resort,
}: ConversationFlagUpdate & {
	entries: (Conversation | undefined)[];
	pendingFlags: PendingFlags<ConversationFlagField>;
	resort: () => void;
}): Promise<void> {
	const targets = entries.filter(
		(entry): entry is Conversation =>
			entry !== undefined && entry.data[field] !== value,
	);
	if (targets.length === 0) return;
	for (const entry of targets) {
		entry.data[field] = value;
		pendingFlags.mark({ conversationId: entry.data.conversationId, field });
	}
	if (field === "pinned") resort();

	try {
		const rolledBack = await applyOptimisticBatch({
			items: targets,
			request: (entry) => request(entry.data.conversationId),
			rollback: (entry) => {
				entry.data[field] = !value;
			},
			errorLabel,
		});
		if (rolledBack) resort();
	} finally {
		for (const entry of targets) {
			pendingFlags.unmark({
				conversationId: entry.data.conversationId,
				field,
			});
		}
	}
}
