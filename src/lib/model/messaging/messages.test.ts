import { describe, expect, it, vi } from "vitest";

import {
	apiResponseMessageSchema,
	messageSchema,
} from "$lib/model/messaging/messages";

function incoming(messageId: string) {
	return {
		type: "Text",
		body: { text: "hello" },
		messageId,
		conversationId: "conversation-1",
		senderId: 42,
		timestamp: 1_710_000_000_000,
		unsent: false,
		reactions: [],
	};
}

async function freshApiResponseMessageSchema() {
	vi.resetModules();
	const messages = await import("$lib/model/messaging/messages");
	return messages.apiResponseMessageSchema;
}

describe("messageSchema", () => {
	it("accepts outgoing text messages", () => {
		expect(
			messageSchema.parse({ type: "Text", body: { text: "hello" } }),
		).toEqual({ type: "Text", body: { text: "hello" } });
	});

	it("rejects private image messages with invalid media hashes", () => {
		const result = messageSchema.safeParse({
			type: "Image",
			body: {
				mediaId: 10,
				url: "https://images.example/private.jpg",
				width: 640,
				height: 480,
				imageHash: "abc123",
				takenOnGrindr: false,
				createdAt: 1_710_000_000_000,
			},
		});

		expect(result.success).toBe(false);
	});

	it("parses expiring image messages as the server sends them", () => {
		const body = {
			mediaId: 2_351_384_549,
			url: "https://cdns.grindr.com/images/chat/expiring.jpg",
			width: 96,
			height: 96,
			duration: 10_000,
			viewsRemaining: 1,
			expiresAt: 1_784_725_105_329,
			viewed: false,
		};

		expect(messageSchema.parse({ type: "ExpiringImage", body })).toEqual({
			type: "ExpiringImage",
			body,
		});
	});

	it("accepts spent expiring image messages with a null url", () => {
		const body = {
			mediaId: 5002,
			width: null,
			height: null,
			url: null,
			duration: 10_000,
			viewsRemaining: 0,
			expiresAt: null,
			viewed: true,
		};

		expect(messageSchema.parse({ type: "ExpiringImage", body })).toEqual({
			type: "ExpiringImage",
			body,
		});
	});

	it("accepts expiring image messages without the view tracking fields", () => {
		const body = {
			mediaId: 5003,
			width: null,
			height: null,
			url: "https://cdns.grindr.com/images/chat/expiring.jpg",
		};

		expect(messageSchema.parse({ type: "ExpiringImage", body })).toEqual({
			type: "ExpiringImage",
			body,
		});
	});

	it("drops regular image fields the server never sends for expiring images", () => {
		expect(
			messageSchema.parse({
				type: "ExpiringImage",
				body: {
					mediaId: 5004,
					width: null,
					height: null,
					url: null,
					imageHash: "a".repeat(64),
					takenOnGrindr: true,
					createdAt: 1_710_000_000_000,
				},
			}),
		).toEqual({
			type: "ExpiringImage",
			body: { mediaId: 5004, width: null, height: null, url: null },
		});
	});
});

describe("apiResponseMessageSchema", () => {
	it("accepts incoming chat messages with response metadata", () => {
		expect(
			apiResponseMessageSchema.parse({
				type: "Text",
				body: { text: "hello" },
				messageId: "msg-1",
				conversationId: "conversation-1",
				senderId: 42,
				timestamp: 1_710_000_000_000,
				unsent: false,
				reactions: [{ profileId: 99, reactionType: 1 }],
			}),
		).toEqual({
			type: "Text",
			body: { text: "hello" },
			messageId: "msg-1",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [{ profileId: 99, reactionType: 1 }],
		});
	});

	it("degrades an unmodeled message type to Unknown, keeping the wire type", () => {
		const result = apiResponseMessageSchema.parse({
			type: "SomeFutureType",
			body: { status: "pending" },
			messageId: "msg-2",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
		});

		expect(result.type).toBe("Unknown");
		expect(result.messageId).toBe("msg-2");
		expect(result).toHaveProperty("unrecognizedType", "SomeFutureType");
	});

	it("reports a modeled type whose body no longer matches, once", async () => {
		const schema = await freshApiResponseMessageSchema();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const drifted = {
			type: "Text",
			body: { message: "hello" },
			messageId: "msg-3",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
		};

		const first = schema.parse(drifted);
		schema.parse(drifted);

		expect(first.type).toBe("Unknown");
		expect(first).toHaveProperty("unrecognizedType", "Text");
		expect(warn).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("Text"));
		warn.mockRestore();
	});

	it("stays quiet about a type it never modeled", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		apiResponseMessageSchema.parse({
			type: "AnotherFutureType",
			body: {},
			messageId: "msg-4",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
		});

		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it("degrades a private image with an invalid media hash rather than failing", async () => {
		const schema = await freshApiResponseMessageSchema();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = schema.parse({
			type: "Image",
			body: {
				mediaId: 10,
				url: "https://images.example/private.jpg",
				width: 640,
				height: 480,
				imageHash: "abc123",
				takenOnGrindr: false,
				createdAt: 1_710_000_000_000,
			},
			messageId: "msg-6",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
		});

		expect(result.type).toBe("Unknown");
		expect(result).toHaveProperty("unrecognizedType", "Image");
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it("keeps a quoted reply on the message that replies to it", () => {
		const result = apiResponseMessageSchema.parse({
			...incoming("msg-7"),
			replyToMessage: { ...incoming("msg-quoted"), senderId: 7 },
		});

		expect(result.replyToMessage).toMatchObject({
			type: "Text",
			messageId: "msg-quoted",
			senderId: 7,
		});
	});

	it("accepts a quote the server trimmed down to its identifying fields", () => {
		const result = apiResponseMessageSchema.parse({
			...incoming("msg-8"),
			replyToMessage: {
				type: "Text",
				body: { text: "hello" },
				messageId: "msg-quoted",
				senderId: 7,
			},
		});

		expect(result.replyToMessage).toMatchObject({
			messageId: "msg-quoted",
		});
	});

	it.each([
		["null", null],
		["absent", undefined],
	])("accepts a %s quote", (_label, replyToMessage) => {
		const payload = incoming("msg-9");
		if (replyToMessage !== undefined) {
			Object.assign(payload, { replyToMessage });
		}

		expect(apiResponseMessageSchema.safeParse(payload).success).toBe(true);
	});

	it("drops a quote it cannot model rather than losing the message", async () => {
		const schema = await freshApiResponseMessageSchema();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = schema.parse({
			...incoming("msg-10"),
			replyToMessage: { nonsense: true },
		});

		expect(result.messageId).toBe("msg-10");
		expect(result.replyToMessage).toBeNull();
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it("does not recurse into a quote's own quote", () => {
		const result = apiResponseMessageSchema.parse({
			...incoming("msg-11"),
			replyToMessage: {
				...incoming("msg-quoted"),
				replyToMessage: { hopelessly: "unmodelable" },
			},
		});

		expect(result.replyToMessage).toMatchObject({
			messageId: "msg-quoted",
		});
	});

	it("does not pay for depth when a deeply nested quote chain fails", () => {
		let replyToMessage: Record<string, unknown> = { unmodelable: true };
		for (let depth = 0; depth < 400; depth++) {
			replyToMessage = { ...incoming(`deep-${depth}`), replyToMessage };
		}

		const started = performance.now();
		const result = apiResponseMessageSchema.safeParse({
			...incoming("msg-12"),
			replyToMessage,
		});

		expect(result.success).toBe(true);
		expect(performance.now() - started).toBeLessThan(1000);
	});

	it.each(["reactions", "unsent"])(
		"defaults %s when the server omits it",
		(field) => {
			const incomplete: Record<string, unknown> = incoming("msg-14");
			delete incomplete[field];

			const result = apiResponseMessageSchema.parse(incomplete);

			expect(result.type).toBe("Text");
			expect(result.reactions).toEqual([]);
			expect(result.unsent).toBe(false);
		},
	);

	it("renders a message whose body key is absent as Unknown", () => {
		const withoutBody: Record<string, unknown> = incoming("msg-13");
		delete withoutBody.body;

		const result = apiResponseMessageSchema.parse(withoutBody);

		expect(result.type).toBe("Unknown");
		expect(result).toHaveProperty("unrecognizedType", "Text");
	});

	it("models a Right Now request message", () => {
		const result = apiResponseMessageSchema.parse({
			type: "RightNowRequest",
			body: {
				requestId: 8_812_345,
				requestCreatedAt: 1_710_000_000_000,
				requestUpdatedAt: 1_710_000_060_000,
				postStatus: "ACTIVE",
				postId: null,
				medias: [{ mediaHash: "abc123", isNsfw: false }],
			},
			messageId: "msg-5",
			conversationId: "conversation-1",
			senderId: 42,
			timestamp: 1_710_000_000_000,
			unsent: false,
			reactions: [],
		});

		expect(result.type).toBe("RightNowRequest");
		expect(result).toHaveProperty("body.medias", [
			{ mediaHash: "abc123", isNsfw: false },
		]);
	});
});
