import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const handlers = vi.hoisted(() => new Map<string, (raw: unknown) => void>());
const push = vi.hoisted(() => ({
	dismissPushConversation:
		vi.fn<
			(chat: {
				conversationId: string;
				messageId?: string;
			}) => Promise<void>
		>(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on: <T>(
			type: string,
			schema: z.ZodType<T>,
			handler: (event: T) => void,
		) => {
			handlers.set(type, (raw) => {
				const parsed = schema.safeParse(raw);
				if (parsed.success) handler(parsed.data);
			});
			return Promise.resolve(() => {});
		},
	},
}));
vi.mock("./index", () => push);

const { watchChatWithdrawals } = await import("./chat-withdrawals");

function message(over: Record<string, unknown>) {
	return {
		type: "chat.v1.message_sent",
		payload: {
			messageId: "1790242847880:cfc76469",
			conversationId: "852120758:858049792",
			senderId: 852120758,
			timestamp: 1790242847880,
			unsent: false,
			reactions: [],
			type: "Text",
			body: { text: "retry one" },
			replyToMessage: null,
			dynamic: false,
			chat1Type: "text",
			replyPreview: null,
			...over,
		},
	};
}

function deliver(type: string, raw: unknown): void {
	const handler = handlers.get(type);
	if (!handler) throw new Error(`nothing listens for ${type}`);
	handler(raw);
}

beforeEach(async () => {
	vi.clearAllMocks();
	handlers.clear();
	push.dismissPushConversation.mockResolvedValue(undefined);
	await watchChatWithdrawals();
});

describe("withdrawing chat notifications over the websocket", () => {
	it("withdraws the message that was just unsent from its chat's notification", () => {
		deliver("chat.v1.message_sent", message({ unsent: true, body: null }));

		expect(push.dismissPushConversation).toHaveBeenCalledExactlyOnceWith({
			conversationId: "852120758:858049792",
			messageId: "1790242847880:cfc76469",
		});
	});

	it("leaves a chat alone when an ordinary message arrives", () => {
		deliver("chat.v1.message_sent", message({}));

		expect(push.dismissPushConversation).not.toHaveBeenCalled();
	});

	it("clears every chat the server deleted, for example after a block", () => {
		deliver("chat.v1.conversation.delete", {
			type: "chat.v1.conversation.delete",
			payload: { conversationIds: ["1:2", "3:4"] },
		});

		expect(push.dismissPushConversation.mock.calls).toEqual([
			[{ conversationId: "1:2" }],
			[{ conversationId: "3:4" }],
		]);
	});

	it("logs instead of throwing when Android cannot clear the chat", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		push.dismissPushConversation.mockRejectedValue(new Error("ipc"));

		deliver("chat.v1.message_sent", message({ unsent: true, body: null }));
		await Promise.resolve();

		expect(logged).toHaveBeenCalled();
	});
});
