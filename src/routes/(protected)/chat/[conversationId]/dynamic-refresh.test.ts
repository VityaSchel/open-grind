import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type z from "zod";

const { refreshMessagesByIdMock, handlers, appLifecycle } = vi.hoisted(() => ({
	refreshMessagesByIdMock: vi.fn(),
	handlers: new Map<string, (event: unknown) => void>(),
	appLifecycle: { active: true },
}));

vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	refreshMessagesById: refreshMessagesByIdMock,
}));
vi.mock("$lib/api/app-lifecycle.svelte", () => ({ appLifecycle }));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: {
		on(type: string, schema: z.ZodType, handler: (event: unknown) => void) {
			handlers.set(type, (event) => {
				const parsed = schema.safeParse(event);
				if (parsed.success) handler(parsed.data);
			});
			return Promise.resolve(vi.fn());
		},
	},
}));

import { resetNowForTesting, setNowForTesting } from "$lib/util/clock";
import { DynamicMessagesRefresh } from "./dynamic-refresh";
import type { OptimisticMessage } from "./merge-messages";

const CONVERSATION_ID = "1:2";
const START = 1_700_000_000_000;
const MINUTE = 60 * 1000;

function message({
	id,
	ageMinutes,
	dynamic = true,
	status = "sent",
	text = id,
}: {
	id: string;
	ageMinutes: number;
	dynamic?: boolean;
	status?: OptimisticMessage["status"];
	text?: string;
}): OptimisticMessage {
	return {
		messageId: id,
		conversationId: CONVERSATION_ID,
		senderId: 2,
		timestamp: START - ageMinutes * MINUTE,
		unsent: false,
		reactions: [],
		dynamic,
		type: "Text",
		body: { text },
		status,
	};
}

const serverCopy = (local: OptimisticMessage, text: string) => {
	const { status: _status, ...rest } = local;
	void _status;
	return { ...rest, body: { text } };
};

function start(
	messages: OptimisticMessage[],
	{ paused = () => false }: { paused?: () => boolean } = {},
) {
	const commit = vi.fn();
	const refresh = new DynamicMessagesRefresh({
		conversationId: CONVERSATION_ID,
		messages: () => messages,
		commit,
		paused,
	});
	return { commit, refresh };
}

function emit(type: string, payload: unknown) {
	handlers.get(type)?.({ type, payload });
}

const albumShareChanged = (conversationId = CONVERSATION_ID) =>
	emit("chat.v1.refresh_dynamic", { conversationId, messageType: "Album" });

const requestedIds = (call = 0) =>
	(refreshMessagesByIdMock.mock.calls[call]?.[0] as { messageIds: string[] })
		?.messageIds;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(START);
	handlers.clear();
	appLifecycle.active = true;
	refreshMessagesByIdMock.mockReset();
	refreshMessagesByIdMock.mockResolvedValue({ messages: [] });
});

afterEach(() => {
	resetNowForTesting();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("dynamic message refresh", () => {
	it("asks right away for the dynamic messages at least ten minutes old", async () => {
		const { refresh } = start([
			message({ id: "young", ageMinutes: 9 }),
			message({ id: "old", ageMinutes: 10 }),
			message({ id: "static", ageMinutes: 60, dynamic: false }),
			message({ id: "draft", ageMinutes: 60, status: "pending" }),
		]);
		await settle();

		expect(refreshMessagesByIdMock).toHaveBeenCalledExactlyOnceWith({
			conversationId: CONVERSATION_ID,
			messageIds: ["old"],
		});
		refresh.destroy();
	});

	it("asks again every five minutes", async () => {
		const { refresh } = start([message({ id: "old", ageMinutes: 30 })]);
		await settle();

		await vi.advanceTimersByTimeAsync(4 * MINUTE);
		expect(refreshMessagesByIdMock).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(MINUTE);
		expect(refreshMessagesByIdMock).toHaveBeenCalledTimes(2);
		refresh.destroy();
	});

	it("keeps the five minute period when the fifth tick fires a little early", async () => {
		setNowForTesting(() => Date.now() + 500);
		const { refresh } = start([message({ id: "old", ageMinutes: 30 })]);
		await settle();
		resetNowForTesting();

		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(refreshMessagesByIdMock).toHaveBeenCalledTimes(2);
		refresh.destroy();
	});

	it("sends nothing while no dynamic message is old enough", async () => {
		const { refresh } = start([
			message({ id: "young", ageMinutes: 1 }),
			message({ id: "static", ageMinutes: 60, dynamic: false }),
		]);
		await vi.advanceTimersByTimeAsync(8 * MINUTE);

		expect(refreshMessagesByIdMock).not.toHaveBeenCalled();
		refresh.destroy();
	});

	it("waits while the app is in the background and catches up when it returns", async () => {
		appLifecycle.active = false;
		const { refresh } = start([message({ id: "old", ageMinutes: 30 })]);
		await vi.advanceTimersByTimeAsync(20 * MINUTE);
		expect(refreshMessagesByIdMock).not.toHaveBeenCalled();

		appLifecycle.active = true;
		await vi.advanceTimersByTimeAsync(MINUTE);

		expect(refreshMessagesByIdMock).toHaveBeenCalledTimes(1);
		refresh.destroy();
	});

	it("asks nothing while the conversation is paused, even for album events", async () => {
		const { refresh } = start([message({ id: "old", ageMinutes: 30 })], {
			paused: () => true,
		});
		albumShareChanged();
		await vi.advanceTimersByTimeAsync(20 * MINUTE);

		expect(refreshMessagesByIdMock).not.toHaveBeenCalled();
		refresh.destroy();
	});

	it("refreshes every dynamic message when an album share changes in this chat", async () => {
		const { refresh } = start([message({ id: "young", ageMinutes: 1 })]);
		await settle();

		albumShareChanged("3:4");
		emit("chat.v1.refresh_dynamic", {
			conversationId: CONVERSATION_ID,
			messageType: "Video",
		});
		await settle();
		expect(refreshMessagesByIdMock).not.toHaveBeenCalled();

		albumShareChanged();
		await settle();

		expect(requestedIds()).toEqual(["young"]);
		refresh.destroy();
	});

	it("refreshes every dynamic message when an album arrives in this chat", async () => {
		const { refresh } = start([message({ id: "young", ageMinutes: 1 })]);
		await settle();

		emit("chat.v1.message_sent", { conversationId: "3:4", type: "Album" });
		emit("chat.v1.message_sent", {
			conversationId: CONVERSATION_ID,
			type: "Text",
		});
		await settle();
		expect(refreshMessagesByIdMock).not.toHaveBeenCalled();

		emit("chat.v1.message_sent", {
			conversationId: CONVERSATION_ID,
			type: "ExpiringAlbumV2",
			body: { unexpected: "shape" },
		});
		await settle();

		expect(requestedIds()).toEqual(["young"]);
		refresh.destroy();
	});

	it("includes the album that arrived once the chat has stored it", async () => {
		const messages = [message({ id: "young", ageMinutes: 1 })];
		const { refresh } = start(messages);
		await settle();

		emit("chat.v1.message_sent", {
			conversationId: CONVERSATION_ID,
			type: "Album",
		});
		messages.unshift(message({ id: "arrived", ageMinutes: 0 }));
		await settle();

		expect(requestedIds()).toEqual(["arrived", "young"]);
		refresh.destroy();
	});

	it("does not push back the periodic run after an album refresh", async () => {
		const { refresh } = start([message({ id: "old", ageMinutes: 30 })]);
		await settle();
		await vi.advanceTimersByTimeAsync(3 * MINUTE);
		albumShareChanged();
		await settle();

		await vi.advanceTimersByTimeAsync(2 * MINUTE);

		expect(refreshMessagesByIdMock).toHaveBeenCalledTimes(3);
		refresh.destroy();
	});

	it("commits refreshed bodies and leaves an unchanged thread alone", async () => {
		const old = message({ id: "old", ageMinutes: 30, text: "before" });
		refreshMessagesByIdMock.mockResolvedValueOnce({
			messages: [serverCopy(old, "before")],
		});
		const { commit, refresh } = start([old]);
		await settle();
		expect(commit).not.toHaveBeenCalled();

		refreshMessagesByIdMock.mockResolvedValueOnce({
			messages: [serverCopy(old, "after")],
		});
		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(commit).toHaveBeenCalledExactlyOnceWith([
			expect.objectContaining({
				messageId: "old",
				body: { text: "after" },
			}),
		]);
		refresh.destroy();
	});

	it("keeps a message that changed while its refresh was in flight", async () => {
		const messages = [
			message({ id: "changed", ageMinutes: 30, text: "before" }),
			message({ id: "untouched", ageMinutes: 30, text: "before" }),
		];
		const answer = deferred<{ messages: unknown[] }>();
		refreshMessagesByIdMock.mockReturnValueOnce(answer.promise);
		const { commit, refresh } = start(messages);
		await settle();

		const [changed, untouched] = messages as [
			OptimisticMessage,
			OptimisticMessage,
		];
		changed.reactions.push({ profileId: 1, reactionType: 1 });
		answer.resolve({
			messages: [
				serverCopy({ ...changed, reactions: [] }, "stale"),
				serverCopy(untouched, "after"),
			],
		});
		await settle();

		const committed = commit.mock.lastCall?.[0] as OptimisticMessage[];
		expect(committed.map((m) => [m.messageId, m.body])).toEqual([
			["changed", { text: "before" }],
			["untouched", { text: "after" }],
		]);
		expect(committed[0]?.reactions).toHaveLength(1);
		refresh.destroy();
	});

	it("logs a failed refresh and tries again on the next round", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		refreshMessagesByIdMock.mockRejectedValueOnce(new Error("offline"));
		const { refresh } = start([message({ id: "old", ageMinutes: 30 })]);
		await settle();
		expect(logged).toHaveBeenCalledOnce();

		await vi.advanceTimersByTimeAsync(5 * MINUTE);

		expect(refreshMessagesByIdMock).toHaveBeenCalledTimes(2);
		refresh.destroy();
	});

	it("runs a full refresh asked for while one is in flight once it lands", async () => {
		const first = deferred<{ messages: never[] }>();
		refreshMessagesByIdMock.mockReturnValueOnce(first.promise);
		const { refresh } = start([
			message({ id: "old", ageMinutes: 30 }),
			message({ id: "young", ageMinutes: 1 }),
		]);
		await settle();

		albumShareChanged();
		await settle();
		expect(refreshMessagesByIdMock).toHaveBeenCalledTimes(1);

		first.resolve({ messages: [] });
		await settle();

		expect(requestedIds(1)).toEqual(["old", "young"]);
		refresh.destroy();
	});

	it("stops asking and ignores a late answer once destroyed", async () => {
		const old = message({ id: "old", ageMinutes: 30, text: "before" });
		const answer = deferred<{ messages: unknown[] }>();
		refreshMessagesByIdMock.mockReturnValueOnce(answer.promise);
		const { commit, refresh } = start([old]);
		await settle();

		refresh.destroy();
		answer.resolve({ messages: [serverCopy(old, "after")] });
		await vi.advanceTimersByTimeAsync(20 * MINUTE);

		expect(commit).not.toHaveBeenCalled();
		expect(refreshMessagesByIdMock).toHaveBeenCalledTimes(1);
	});
});
