import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

vi.hoisted(() => {
	Object.assign(globalThis, {
		__TAURI_OS_PLUGIN_INTERNALS__: { platform: "android" },
	});
});
const {
	invokeMock,
	listeners,
	getConversationsMock,
	getConversationMock,
	sendMessageMock,
	signOutMock,
} = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	listeners: new Map<string, Set<(event: { payload: unknown }) => void>>(),
	getConversationsMock: vi.fn(),
	getConversationMock: vi.fn(),
	sendMessageMock: vi.fn(),
	signOutMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/event", () => ({
	listen: (name: string, handler: (event: { payload: unknown }) => void) => {
		const handlers = listeners.get(name) ?? new Set();
		listeners.set(name, handlers);
		handlers.add(handler);
		return Promise.resolve(() => handlers.delete(handler));
	},
}));
vi.mock("$app/state", () => ({ page: { route: { id: "/(protected)/chat" } } }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/sign-out", () => ({ signOut: signOutMock }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: false }),
}));
vi.mock("$lib/entitlements/honduras-hold", () => ({
	awaitHomeLocation: () => Promise.resolve(),
}));
vi.mock("$lib/util/breakpoints.svelte", () => ({
	below: () => ({ current: false }),
}));
vi.mock("$lib/api/messaging/conversations", () => ({
	getConversations: getConversationsMock,
	markConversationAsRead: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	sendMessage: sendMessageMock,
}));
vi.mock("./messages", () => ({ getConversation: getConversationMock }));
vi.mock("svelte-sonner", () => ({
	toast: { error: vi.fn(), dismiss: vi.fn() },
}));

import { sessionRecovery } from "$lib/api/session-recovery.svelte";
import { ConversationsState } from "$lib/chat/conversations-state.svelte";
import {
	conversation,
	deferred,
	microtasks,
	OUR_ID,
	PEER_ID,
} from "$lib/chat/conversations-test-helpers";
import SessionErrorAlert from "$lib/components/feedback/SessionErrorAlert.svelte";
import { previewFromMessage } from "$lib/model/messaging/message-preview";
import {
	type ApiResponseMessage,
	apiResponseMessageSchema,
} from "$lib/model/messaging/messages";
import { setVisibility } from "$lib/test/visibility";
import { ws } from "$lib/ws.svelte";
import { ConversationState } from "./conversation-state.svelte";

const CHAT = "1:2";
const PAST_RECONCILE_THROTTLE_MS = 3_000;
const profile = {
	distance: null,
	mediaHash: null,
	name: "Peer",
	onlineUntil: null,
	profileId: PEER_ID,
	showDistance: false,
};
let clock = Date.now();
let inbox: ConversationsState;
let chat: ConversationState;

function message(messageId: string, timestamp: number, senderId = PEER_ID) {
	return apiResponseMessageSchema.parse({
		messageId,
		conversationId: CHAT,
		senderId,
		timestamp,
		type: "Text",
		body: { text: messageId },
	});
}

function history(messages: ApiResponseMessage[]) {
	return { messages, profile, pageKey: null, lastReadTimestamp: null };
}

function snapshot(latest: ApiResponseMessage) {
	return {
		entries: [
			conversation(CHAT, latest.timestamp, {
				preview: previewFromMessage(latest),
			}),
		],
		nextPage: null,
	};
}

function emit(name: string, payload: unknown = null) {
	const handlers = listeners.get(name);
	if (!handlers?.size) throw new Error(`No listener for ${name}`);
	for (const handler of handlers) handler({ payload });
}

function receive(payload: ApiResponseMessage) {
	emit("grindr:chat_v1_message_sent", {
		type: "chat.v1.message_sent",
		payload,
	});
}

function reconnect() {
	clock += PAST_RECONCILE_THROTTLE_MS;
	emit("ws:disconnected");
	expect(ws.status).toBe("disconnected");
	emit("ws:connected");
	expect(ws.status).toBe("connected");
}

async function openChat() {
	getConversationsMock.mockResolvedValue(
		snapshot(message("before-drop", 1_000)),
	);
	getConversationMock.mockResolvedValue(
		history([message("before-drop", 1_000)]),
	);
	inbox = new ConversationsState({
		ourProfileId: OUR_ID,
		onIncomingMessage: vi.fn(),
	});
	await vi.waitFor(() => expect(inbox.loading).toBe(false));
	chat = new ConversationState({
		conversationId: CHAT,
		ourProfileId: OUR_ID,
		conversations: inbox,
	});
	await vi.waitFor(() => expect(chat.loading).toBe(false));
}

function expectHistory(ids: string[]) {
	expect(chat.messages.map((entry) => entry.messageId)).toEqual(ids);
	expect(
		inbox
			.getCachedConversation(CHAT)
			?.messages.map((entry) => entry.messageId),
	).toEqual(ids);
}

async function consumeFirstConnectSkip() {
	emit("ws:connected");
	await Promise.resolve();
}

beforeAll(consumeFirstConnectSkip);

beforeEach(async () => {
	vi.clearAllMocks();
	localStorage.clear();
	clock += PAST_RECONCILE_THROTTLE_MS;
	vi.spyOn(Date, "now").mockImplementation(() => clock);
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	invokeMock.mockImplementation((name: string) => {
		if (name === "current_session")
			return Promise.resolve({
				profileId: OUR_ID,
				expiresAt: 0,
				stale: true,
			});
		if (name === "refresh_session")
			return Promise.resolve({ profileId: OUR_ID });
		return Promise.resolve(null);
	});
	signOutMock.mockResolvedValue(undefined);
	setVisibility("visible");
	sessionRecovery.recover();
	await openChat();
});

afterEach(async () => {
	cleanup();
	chat.destroy();
	await inbox.destroy();
	sessionRecovery.recover();
	vi.restoreAllMocks();
});

describe("session and chat recovery across the native event boundary", () => {
	it("recovers messages missed while disconnected and deduplicates replayed events", async () => {
		const missed = message("missed-while-offline", 2_000);
		getConversationsMock.mockResolvedValue(snapshot(missed));
		getConversationMock.mockResolvedValue(
			history([missed, message("before-drop", 1_000)]),
		);

		reconnect();
		await vi.waitFor(() =>
			expectHistory(["missed-while-offline", "before-drop"]),
		);
		receive(missed);
		receive(missed);

		expectHistory(["missed-while-offline", "before-drop"]);
		expect(inbox.entries).toHaveLength(1);
		expect(inbox.entries[0]?.data.unreadCount).toBe(0);
		expect(inbox.entries[0]?.data.preview?.text).toBe(
			"missed-while-offline",
		);
	});

	it("queues a new snapshot when events are dropped during a delayed reconnect fetch", async () => {
		const gate = deferred<ReturnType<typeof history>>();
		getConversationMock.mockReturnValueOnce(gate.promise);
		reconnect();
		await vi.waitFor(() => expect(chat.refreshing).toBe(true));
		expectHistory(["before-drop"]);

		const missed = message("dropped-during-recovery", 3_000);
		getConversationMock.mockResolvedValue(
			history([missed, message("before-drop", 1_000)]),
		);
		getConversationsMock.mockResolvedValue(snapshot(missed));
		clock += PAST_RECONCILE_THROTTLE_MS;
		emit("ws:events-dropped", 2);
		await vi.waitFor(() =>
			expect(
				invokeMock.mock.calls.filter(
					([name]) => name === "current_session",
				),
			).toHaveLength(2),
		);
		await microtasks();
		gate.resolve(history([message("before-drop", 1_000)]));

		await vi.waitFor(() =>
			expectHistory(["dropped-during-recovery", "before-drop"]),
		);
		expect(getConversationMock).toHaveBeenCalledTimes(3);
	});

	it("applies server metadata to a live message received during recovery", async () => {
		const gate = deferred<ReturnType<typeof history>>();
		getConversationMock.mockReturnValueOnce(gate.promise);
		reconnect();
		await vi.waitFor(() => expect(chat.refreshing).toBe(true));
		const live = message("arrived-during-recovery", 4_000);
		receive(live);
		gate.resolve(
			history([{ ...live, unsent: true }, message("before-drop", 1_000)]),
		);
		await vi.waitFor(() => expect(chat.refreshing).toBe(false));
		expectHistory(["arrived-during-recovery", "before-drop"]);
		expect(chat.messages[0]).toMatchObject({ unsent: true });
	});

	it("still removes messages and conversations the server deleted before the fetch", async () => {
		getConversationMock.mockResolvedValue(history([]));
		getConversationsMock.mockResolvedValue({ entries: [], nextPage: null });
		reconnect();
		await vi.waitFor(() => {
			expect(chat.messages).toHaveLength(0);
			expect(inbox.entries).toHaveLength(0);
		});
	});

	it("keeps one sent message when its echo and reconnect history beat a delayed send response", async () => {
		const send = deferred<ApiResponseMessage>();
		sendMessageMock.mockReturnValueOnce(send.promise);
		chat.send([
			{
				outbound: { type: "Text", body: { text: "sent-before-drop" } },
				optimistic: {
					type: "Text",
					body: { text: "sent-before-drop" },
				},
			},
		]);
		expect(chat.messages[0]?.status).toBe("pending");
		const sent = message("sent-before-drop", clock + 1_000, OUR_ID);
		receive(sent);
		receive(sent);
		getConversationMock.mockResolvedValue(
			history([sent, message("before-drop", 1_000)]),
		);
		getConversationsMock.mockResolvedValue(snapshot(sent));
		reconnect();
		await vi.waitFor(() => {
			expect(getConversationMock).toHaveBeenCalledTimes(2);
			expect(chat.refreshing).toBe(false);
		});
		send.resolve(sent);
		await microtasks();
		expectHistory(["sent-before-drop", "before-drop"]);
		expect(chat.messages.every((entry) => entry.status === "sent")).toBe(
			true,
		);
		expect(sendMessageMock).toHaveBeenCalledOnce();
	});

	it("retries an expired session through the dialog and restores missed messages on reconnection", async () => {
		render(SessionErrorAlert);
		emit("auth:session-error", {
			message: "Token expired",
			unauthorized: false,
			kind: "SessionStale",
			attempts: 3,
			transient: true,
		});
		await screen.findByRole("alertdialog");
		expect(
			screen.getByText("Token expired (after 3 attempts)"),
		).toBeTruthy();
		const refresh = deferred<{ profileId: number }>();
		invokeMock.mockImplementation((name: string) =>
			name === "refresh_session"
				? refresh.promise
				: Promise.resolve({
						profileId: OUR_ID,
						expiresAt: 0,
						stale: true,
					}),
		);
		await fireEvent.click(
			screen.getByRole("button", { name: "Try again" }),
		);
		expect(
			screen
				.getByRole("button", { name: "Try again" })
				.getAttribute("aria-busy"),
		).toBe("true");
		refresh.resolve({ profileId: OUR_ID });
		await vi.waitFor(() =>
			expect(screen.queryByRole("alertdialog")).toBeNull(),
		);
		const missed = message("after-session-refresh", 5_000);
		getConversationMock.mockResolvedValue(
			history([missed, message("before-drop", 1_000)]),
		);
		getConversationsMock.mockResolvedValue(snapshot(missed));
		reconnect();
		await vi.waitFor(() =>
			expectHistory(["after-session-refresh", "before-drop"]),
		);
		expect(invokeMock).toHaveBeenCalledWith("refresh_session", undefined);
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("hands revoked sessions to sign-out and stops fetching protected history without a session", async () => {
		render(SessionErrorAlert);
		emit("auth:session-error", {
			message: "Session revoked",
			unauthorized: true,
			kind: "Unauthorized",
			attempts: 1,
			transient: false,
		});
		expect(signOutMock).toHaveBeenCalledOnce();
		invokeMock.mockResolvedValue({
			profileId: null,
			expiresAt: null,
			stale: false,
		});
		reconnect();
		await vi.waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith(
				"current_session",
				undefined,
			),
		);
		await microtasks();
		expect(getConversationMock).toHaveBeenCalledOnce();
		expect(getConversationsMock).toHaveBeenCalledOnce();
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});
});
