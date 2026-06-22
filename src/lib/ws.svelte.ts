import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import z from "zod";

import { tapTypeSchema } from "$lib/model/interest/taps";
import { mediaHashPublicSchema } from "$lib/model/media";
import { apiResponseMessageSchema } from "$lib/model/message";
import { unixTimestampMsSchema } from "$lib/model/types";

export const notificationEventSchema = z.object({
	type: z.string(),
	notificationId: z.string().nullable(),
	ref: z.string().nullable(),
	payload: z.unknown(),
});

export const chatV1MessageSentEventSchema = notificationEventSchema.safeExtend({
	type: z.literal("chat.v1.message_sent"),
	payload: apiResponseMessageSchema,
});

export const chatV1ConversationDeleteEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.conversation.delete"),
		payload: z.object({
			conversationIds: z.array(z.string()),
		}),
	});

export const chatV1ConversationReadEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.conversation_read"),
		payload: z.object({
			conversationId: z.string(),
			profileId: z.coerce.number(),
			timestamp: unixTimestampMsSchema,
		}),
	});

export const tapV1TapSentEventSchema = notificationEventSchema.safeExtend({
	type: z.literal("tap.v1.tap_sent"),
	payload: z.object({
		timestamp: unixTimestampMsSchema,
		senderId: z.number(),
		recipientId: z.number(),
		tapType: tapTypeSchema.or(z.literal(3).transform(() => null)).nullable(),
		senderProfileImageHash: mediaHashPublicSchema.nullable(),
		senderDisplayName: z.string().nullable(),
		isMutual: z.boolean(),
	}),
});

export const viewedMeV1NewViewReceivedEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("viewed_me.v1.new_view_received"),
		payload: z.object({
			viewedCount: z.int().nullable(),
			mostRecent: z
				.object({
					profileId: z.coerce.number().int().nonnegative(),
					photoHash: z.string().nullish(),
					timestamp: unixTimestampMsSchema,
				})
				.nullable(),
		}),
	});

export type ChatV1MessageSentEventPayload = z.infer<
	typeof chatV1MessageSentEventSchema
>;
export type TapV1TapSentEventPayload = z.infer<typeof tapV1TapSentEventSchema>;
export type ViewedMeV1NewViewReceivedEventPayload = z.infer<
	typeof viewedMeV1NewViewReceivedEventSchema
>;
export type ChatV1ConversationDeleteEventPayload = z.infer<
	typeof chatV1ConversationDeleteEventSchema
>;
export type ChatV1ConversationReadEventPayload = z.infer<
	typeof chatV1ConversationReadEventSchema
>;

export type WsStatus = "disconnected" | "connecting" | "connected" | "error";

class WsState {
	status = $state<WsStatus>("disconnected");

	constructor() {
		listen<void>("ws:connected", () => {
			this.status = "connected";
			console.log("[ws] connected");
		}).catch(console.error);

		listen<void>("ws:disconnected", () => {
			this.status = "disconnected";
		}).catch(console.error);

		listen<string>("ws:ws_error", (event) => {
			console.error("[ws] server error", event.payload);
		}).catch(console.error);
	}

	connect(): void {
		console.log("[ws] connecting...");
		invoke("ws_connect").catch((e: unknown) => {
			console.error("[ws] connect failed", e);
		});
	}

	onConnected(handler: () => void): Promise<() => void> {
		return listen<void>("ws:connected", () => handler());
	}

	send(type: string, payload: unknown): void {
		const ref_id = crypto.randomUUID();
		invoke("ws_send", { command: { type, ref_id, payload } }).catch(
			(e: unknown) => {
				console.error("[ws] send failed", type, e);
			},
		);
	}

	on<T>(
		eventType: string,
		schema: z.ZodType<T>,
		handler: (payload: T) => void,
	): Promise<() => void> {
		const safeName = eventType.replaceAll(".", "_");
		return listen<unknown>(`grindr:${safeName}`, (event) => {
			const result = schema.safeParse(event.payload);
			if (result.success) {
				handler(result.data);
			} else {
				console.error(
					`[ws] unexpected payload for ${eventType}:`,
					result.error,
					event.payload,
				);
			}
		});
	}
}

export const ws = new WsState();
