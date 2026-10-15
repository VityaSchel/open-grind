import {
	chatV1ConversationDeleteEventSchema,
	chatV1MessageSentEventSchema,
	ws,
} from "$lib/ws.svelte";
import {
	dismissPushConversation,
	pushAvailableHere,
	shownPushConversations,
} from "./index";

export function watchChatWithdrawals(): Promise<(() => void)[]> {
	return Promise.all([
		ws.on("chat.v1.message_sent", chatV1MessageSentEventSchema, (event) => {
			const { conversationId, messageId, unsent } = event.payload;
			if (unsent) withdrawChatNotification({ conversationId, messageId });
		}),
		ws.on(
			"chat.v1.conversation.delete",
			chatV1ConversationDeleteEventSchema,
			(event) => {
				for (const conversationId of event.payload.conversationIds) {
					withdrawChatNotification({ conversationId });
				}
			},
		),
	]);
}

export function withdrawChatNotification(
	chat: Parameters<typeof dismissPushConversation>[0],
): void {
	if (!pushAvailableHere()) return;
	dismissPushConversation(chat).catch((error: unknown) => {
		console.error("Failed to withdraw the chat's notification", error);
	});
}

export async function withdrawShownReadChats(
	conversationIds: string[],
): Promise<void> {
	if (!pushAvailableHere() || conversationIds.length === 0) return;
	const read = new Set(conversationIds);
	const shown = await shownPushConversations().catch((error: unknown) => {
		console.error("Failed to list the shown chat notifications", error);
		return [];
	});
	for (const conversationId of shown) {
		if (read.has(conversationId))
			withdrawChatNotification({ conversationId });
	}
}
