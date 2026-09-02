import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import z from "zod";

import { ApiError } from "$lib/api/api-error";
import { asAppError } from "$lib/api/methods";
import { tapTypeOrNoneSchema } from "$lib/model/interest/taps";
import { mediaHashPublicSchema } from "$lib/model/media";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import { knownValueOrNull } from "$lib/model/tolerance";
import { unixTimestampMsSchema, unmodeledSchema } from "$lib/model/types";

export const notificationEventSchema = z.object({
	type: z.string(),
	notificationId: z.string().nullish(),
	ref: z.string().nullish(),
	payload: unmodeledSchema,
});

// The server answers a command on `<type>.response`, echoing our `ref` and
// carrying an HTTP-shaped status the official client also treats as nullable.
export const commandResponseEventSchema = notificationEventSchema.safeExtend({
	status: z.int().nullish(),
});

export const chatV1MessageSentEventSchema = notificationEventSchema.safeExtend({
	type: z.literal("chat.v1.message_sent"),
	payload: apiResponseMessageSchema,
});

export const chatV1ConversationDeleteEventSchema =
	notificationEventSchema.safeExtend({
		type: z.literal("chat.v1.conversation.delete"),
		payload: z.object({ conversationIds: z.array(z.string()) }),
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
	type: z.literal(["tap.v1.tap_sent", "tap.v2.tap_sent"]),
	payload: z.object({
		timestamp: unixTimestampMsSchema,
		senderId: z.number(),
		recipientId: z.number(),
		tapType: knownValueOrNull({
			value: tapTypeOrNoneSchema,
			label: "tap event tapType",
		}),
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

export type WsStatus = "disconnected" | "connected";

class WsState {
	status = $state<WsStatus>("disconnected");
	#rejectedHandlers = new Set<(eventType: string) => void>();

	constructor() {
		listen<void>("ws:connected", () => {
			this.status = "connected";
		}).catch((error) => console.error(error));

		listen<void>("ws:disconnected", () => {
			this.status = "disconnected";
		}).catch((error) => console.error(error));
	}

	connect(): void {
		invoke("ws_connect").catch((e: unknown) => {
			console.error("[ws] connect failed", e);
		});
	}

	onConnected(handler: () => void): Promise<() => void> {
		return listen<void>("ws:connected", () => handler());
	}

	onEventsDropped(handler: (skipped: number) => void): Promise<() => void> {
		return listen<number>("ws:events-dropped", (event) => {
			handler(event.payload);
		});
	}

	send(type: string, payload: unknown): void {
		invoke("ws_send", {
			command: { type, ref_id: crypto.randomUUID(), payload },
		}).catch((e: unknown) => {
			console.error("[ws] send failed", type, e);
		});
	}

	sendCommand<T>({
		type,
		payload,
		responseSchema,
		timeoutMs = 10_000,
	}: {
		type: string;
		payload: unknown;
		responseSchema: z.ZodType<T>;
		timeoutMs?: number;
	}): Promise<T> {
		const ref_id = crypto.randomUUID();

		return new Promise<T>((resolve, reject) => {
			let unlisten: (() => void) | undefined;
			let settled = false;
			const settle = (run: () => void) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				unlisten?.();
				run();
			};
			const timeout = setTimeout(
				() =>
					settle(() =>
						reject(
							new ApiError({
								message: `websocket command ${type} timed out`,
								request: { method: "WS", path: type },
							}),
						),
					),
				timeoutMs,
			);

			const request = { method: "WS", path: type, body: payload };
			const failed = (error: unknown) =>
				settle(() =>
					reject(
						error instanceof ApiError
							? error
							: new ApiError({
									message:
										asAppError(error)?.prettyMessage ??
										(error instanceof Error
											? error.message
											: String(error)),
									request,
									kind: asAppError(error)?.kind ?? null,
									cause: error,
								}),
					),
				);

			this.on(
				`${type}.response`,
				commandResponseEventSchema,
				(response) => {
					if (response.ref !== ref_id) return;
					settle(() => {
						const status = response.status ?? 0;
						if (status >= 400) {
							reject(
								new ApiError({
									message: `websocket command ${type} failed`,
									request,
									response: { status, body: "" },
								}),
							);
							return;
						}
						const result = responseSchema.safeParse(
							response.payload,
						);
						if (result.success) {
							resolve(result.data);
							return;
						}
						console.error(
							`[ws] unexpected ${type} response payload:`,
							result.error,
							response.payload,
						);
						reject(
							new ApiError({
								message: `websocket command ${type} returned an unexpected payload`,
								request,
								cause: result.error,
							}),
						);
					});
				},
			)
				.then((fn) => (settled ? fn() : (unlisten = fn)))
				.catch(failed);

			invoke("ws_send", { command: { type, ref_id, payload } }).catch(
				failed,
			);
		});
	}

	onEventRejected(handler: (eventType: string) => void): () => void {
		this.#rejectedHandlers.add(handler);
		return () => this.#rejectedHandlers.delete(handler);
	}

	on<T>(
		eventType: string | string[],
		schema: z.ZodType<T>,
		handler: (payload: T) => void,
	): Promise<() => void> {
		const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
		return Promise.all(
			eventTypes.map((type) =>
				listen<unknown>(
					`grindr:${type.replaceAll(".", "_")}`,
					(event) => {
						const result = schema.safeParse(event.payload);
						if (result.success) {
							handler(result.data);
							return;
						}
						console.error(
							`[ws] unexpected payload for ${type}:`,
							result.error,
							event.payload,
						);
						for (const rejected of this.#rejectedHandlers)
							rejected(type);
					},
				),
			),
		).then(
			(unlisteners) => () =>
				unlisteners.forEach((unlisten) => {
					unlisten();
				}),
		);
	}
}

export const ws = new WsState();
