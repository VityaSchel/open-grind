import z from "zod";

import { errorUrnFromBody } from "$lib/api/error-urn";
import { fetchRest } from "$lib/api/transport";
import {
	type ApiResponseMessage,
	apiResponseMessageSchema,
} from "$lib/model/messaging/messages";
import { unixTimestampMsSchema } from "$lib/model/types";
import type { Conversation } from "$lib/model/messaging/conversations";
import type { OutboundMessage } from "$lib/model/messaging/messages";

const conversationMessagesSchema = z.object({
	lastReadTimestamp: unixTimestampMsSchema.nullable(),
	messages: z.array(apiResponseMessageSchema),
	profile: z.object({
		distance: z.number().nullable(),
		mediaHash: z.string().nullable(),
		name: z.string().nullable(),
		onlineUntil: z.number().nullable(),
		profileId: z.int(),
		showDistance: z.boolean(),
	}),
});

export class ConversationUnavailableError extends Error {
	readonly conversationId: string;

	constructor(conversationId: string) {
		super(`Conversation ${conversationId} is no longer available`);
		this.name = "ConversationUnavailableError";
		this.conversationId = conversationId;
	}
}

export async function getConversationMessages({
	conversationId,
	pageKey,
}: {
	conversationId: string;
	pageKey?: string;
}) {
	const params = new URLSearchParams({ profile: "true" });
	if (pageKey !== undefined) params.set("pageKey", pageKey);
	const res = await fetchRest(
		`/v5/chat/conversation/${conversationId}/message?` + params.toString(),
		{ method: "GET" },
	);
	if (
		res.status === 403 &&
		errorUrnFromBody(res.text()) === "urn:gr:err:unauthorized_action"
	) {
		throw new ConversationUnavailableError(conversationId);
	}
	res.assertOk();
	return res.jsonParsed(conversationMessagesSchema);
}

export async function getSingleMessage({
	conversationId,
	messageId,
}: {
	conversationId: string;
	messageId: string;
}) {
	const message = await fetchRest(
		`/v4/chat/conversation/${conversationId}/message/${messageId}`,
		{ method: "GET" },
	).then((res) =>
		res.jsonParsed(z.object({ message: apiResponseMessageSchema })),
	);
	return message;
}

export async function sendMessage({
	toUserId,
	message,
}: {
	toUserId: number;
	message: OutboundMessage;
}) {
	return await fetchRest("/v4/chat/message/send", {
		method: "POST",
		body: {
			type: message.type,
			target: { type: "Direct", targetId: toUserId },
			body: message.body,
		},
	}).then((res) => res.jsonParsed(apiResponseMessageSchema));
}

export async function reactToMessage({
	conversationId,
	messageId,
	reactionType,
}: {
	conversationId: Conversation["data"]["conversationId"];
	messageId: ApiResponseMessage["messageId"];
	reactionType: number;
}) {
	return await fetchRest("/v4/chat/message/reaction", {
		method: "POST",
		body: { conversationId, messageId, reactionType },
	});
}

export async function deleteMessageForMe({
	conversationId,
	messageId,
}: {
	conversationId: Conversation["data"]["conversationId"];
	messageId: ApiResponseMessage["messageId"];
}) {
	return await fetchRest(`/v4/chat/message/delete`, {
		method: "POST",
		body: { conversationId, messageId },
	}).then((res) => res.assertOk());
}

export async function unsendMessage({
	conversationId,
	messageId,
}: {
	conversationId: Conversation["data"]["conversationId"];
	messageId: ApiResponseMessage["messageId"];
}) {
	return await fetchRest(`/v4/chat/message/unsend`, {
		method: "POST",
		body: { conversationId, messageId },
	}).then((res) => res.assertOk());
}
