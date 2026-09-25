import {
	chatV1ConversationDeleteEventSchema,
	chatV1MessageSentEventSchema,
	ws,
} from "$lib/ws.svelte";
import { dismissPushConversation } from "./index";

export function watchChatWithdrawals(): Promise<(() => void)[]> {
	return Promise.all([
		ws.on("chat.v1.message_sent", chatV1MessageSentEventSchema, (event) => {
			const { conversationId, messageId, unsent } = event.payload;
			if (unsent) dismiss({ conversationId, messageId });
		}),
		ws.on(
			"chat.v1.conversation.delete",
			chatV1ConversationDeleteEventSchema,
			(event) => {
				for (const conversationId of event.payload.conversationIds) {
					dismiss({ conversationId });
				}
			},
		),
	]);
}

function dismiss(chat: Parameters<typeof dismissPushConversation>[0]): void {
	dismissPushConversation(chat).catch((error: unknown) => {
		console.error("Failed to withdraw the chat's notification", error);
	});
}
