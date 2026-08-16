import z from "zod";

import { fetchRest } from "$lib/api/transport";
import {
	type Conversation,
	fullConversationSchema,
} from "$lib/model/messaging/conversations";

const conversationsSchema = z.object({
	entries: z.array(fullConversationSchema),
	nextPage: z.number().nullable(),
});

export type InboxFilterRequest = {
	unreadOnly: boolean;
	chemistryOnly: boolean;
	favoritesOnly: boolean;
	rightNowOnly: boolean;
	onlineNowOnly: boolean;
	distanceMeters: number | null;
	positions: number[];
};

export async function getConversations({
	page = 1,
	filters = null,
}: { page?: number; filters?: InboxFilterRequest | null } = {}) {
	const conversations = await fetchRest(
		"/v4/inbox?" + new URLSearchParams({ page: String(page) }).toString(),
		{ method: "POST", ...(filters ? { body: filters } : {}) },
	).then((res) => res.jsonParsed(conversationsSchema));
	return conversations;
}

export async function markConversationAsRead({
	conversationId,
	messageId = "0:00000000-0000-0000-0000-000000000000",
}: {
	conversationId: string;
	messageId?: string;
}) {
	return await fetchRest(
		`/v4/chat/conversation/${conversationId}/read/${messageId}`,
		{ method: "POST" },
	).then((res) => res.assertOk());
}

export async function deleteConversationForMe({
	conversationId,
}: {
	conversationId: Conversation["data"]["conversationId"];
}) {
	return await fetchRest(`/v4/chat/conversation/${conversationId}`, {
		method: "DELETE",
	}).then((res) => res.assertOk());
}

export async function setConversationPinned({
	conversationId,
	pinned,
}: {
	conversationId: Conversation["data"]["conversationId"];
	pinned: boolean;
}) {
	return await fetchRest(
		`/v4/chat/conversation/${conversationId}/${pinned ? "pin" : "unpin"}`,
		{ method: "POST" },
	).then((res) => res.assertOk());
}

export async function setConversationMuted({
	conversationId,
	muted,
}: {
	conversationId: Conversation["data"]["conversationId"];
	muted: boolean;
}) {
	return await fetchRest(
		`/v1/push/conversation/${conversationId}/${muted ? "mute" : "unmute"}`,
		{ method: "POST" },
	).then((res) => res.assertOk());
}
