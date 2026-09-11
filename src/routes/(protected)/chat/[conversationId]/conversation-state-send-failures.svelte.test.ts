import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getConversationMock, sendMessageMock, offerBypassMock } = vi.hoisted(
	() => ({
		getConversationMock: vi.fn(),
		sendMessageMock: vi.fn(),
		offerBypassMock: vi.fn(),
	}),
);

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/entitlements/bypass.svelte", () => ({
	offerEntitlementBypass: offerBypassMock,
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferences: () => Promise.resolve({ revealMessageRead: true }),
}));
vi.mock("$lib/api/messaging/conversations", () => ({
	markConversationAsRead: vi.fn(() => Promise.resolve()),
}));
vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	reactToMessage: vi.fn(),
	sendMessage: sendMessageMock,
}));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: { subscribe: () => vi.fn() },
}));
vi.mock("./messages", () => ({ getConversation: getConversationMock }));
vi.mock("$lib/ws.svelte", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/ws.svelte")>()),
	ws: { on: () => Promise.resolve(vi.fn()) },
}));

import { ApiError } from "$lib/api/api-error";
import { Drafts } from "$lib/chat/drafts.svelte";
import type {
	Message,
	MessageDraft,
	OutboundMessage,
} from "$lib/model/messaging/messages";
import { ConversationState } from "./conversation-state.svelte";

const CONVERSATION_ID = "1:2";
const OUR_ID = 1;
const PEER_ID = 2;

const profile = {
	distance: null,
	mediaHash: null,
	name: "Peer",
	onlineUntil: null,
	profileId: PEER_ID,
	showDistance: false,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

function outbound(type: string, body: unknown): MessageDraft {
	const message = { type, body } as unknown as Message;
	return {
		outbound: message as unknown as OutboundMessage,
		optimistic: message,
	};
}

function create() {
	return new ConversationState({
		conversationId: CONVERSATION_ID,
		ourProfileId: OUR_ID,
		conversations: {
			setActive: vi.fn(),
			clearActive: vi.fn(),
			getCachedConversation: vi.fn(() => undefined),
			setCachedConversation: vi.fn(),
			updatePreview: vi.fn(),
			markRead: vi.fn(),
			ensureLoaded: vi.fn(),
			remove: vi.fn(() => ({ revert: vi.fn() })),
			drafts: new Drafts(),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
	});
}

const rejectionWithBody = ({
	status,
	body,
}: {
	status: number;
	body: unknown;
}) =>
	new ApiError({
		message: `API request failed with status ${status}`,
		request: { method: "POST", path: "/v4/chat/message/send" },
		response: { status, body: JSON.stringify(body) },
	});

const entitlementLimit = () =>
	rejectionWithBody({
		status: 402,
		body: {
			type: "urn:gr:err:entitlement_limit",
			title: "User has reached their entitlement limits",
			status: 402,
		},
	});

const expiringPhoto = () =>
	outbound("ExpiringImage", { mediaId: 910_002, expiring: true });

describe("ConversationState send failures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps the rejected send's error on the message so it can be copied", async () => {
		const rejection = rejectionWithBody({
			status: 403,
			body: { type: "urn:gr:err:unauthorized_action" },
		});
		sendMessageMock.mockRejectedValue(rejection);

		const state = create();
		await flush();
		state.send([outbound("Text", { text: "a" })]);
		await flush();

		expect(state.messages[0]?.status).toBe("error");
		expect(state.messages[0]?.sendError).toBe(rejection);
		expect(console.error).toHaveBeenCalledWith(
			"Failed to send message (urn:gr:err:unauthorized_action)",
			rejection,
		);
	});

	it("offers the bypass once per photo when the day's allowance is used up", async () => {
		sendMessageMock.mockRejectedValue(entitlementLimit());

		const state = create();
		await flush();
		state.send([expiringPhoto(), expiringPhoto()]);
		await flush();

		expect(offerBypassMock).toHaveBeenCalledTimes(2);
		expect(offerBypassMock).toHaveBeenCalledWith({
			reason: "Daily expiring photo limit reached. Sending more requires a Grindr subscription.",
			retry: expect.any(Function),
		});
		expect(state.messages.every((m) => m.status === "error")).toBe(true);
	});

	it("resends the same message when the bypass retries it", async () => {
		sendMessageMock.mockRejectedValueOnce(entitlementLimit());

		const state = create();
		await flush();
		state.send([expiringPhoto()]);
		await flush();

		sendMessageMock.mockResolvedValue({
			messageId: "server-1",
			timestamp: 1234,
		});
		const { retry } = offerBypassMock.mock.calls[0]?.[0] as {
			retry: () => Promise<void>;
		};
		await retry();

		expect(sendMessageMock).toHaveBeenCalledTimes(2);
		expect(sendMessageMock.mock.calls[1]).toEqual(
			sendMessageMock.mock.calls[0],
		);
		expect(state.messages[0]?.messageId).toBe("server-1");
		expect(state.messages[0]?.status).toBe("sent");
	});

	it("puts the failed bubble back to pending while the retry is in flight", async () => {
		sendMessageMock.mockRejectedValueOnce(entitlementLimit());

		const state = create();
		await flush();
		state.send([expiringPhoto()]);
		await flush();
		expect(state.messages[0]?.status).toBe("error");

		sendMessageMock.mockReturnValue(new Promise(() => {}));
		const { retry } = offerBypassMock.mock.calls[0]?.[0] as {
			retry: () => Promise<void>;
		};
		void retry();
		await flush();

		expect(state.messages[0]?.status).toBe("pending");
		expect(state.messages[0]?.sendError).toBeUndefined();
	});

	it("keeps quiet when another message type hits the same limit", async () => {
		sendMessageMock.mockRejectedValue(entitlementLimit());

		const state = create();
		await flush();
		state.send([outbound("Text", { text: "a" })]);
		await flush();

		expect(offerBypassMock).not.toHaveBeenCalled();
	});

	it("keeps quiet when an expiring photo fails for another reason", async () => {
		sendMessageMock.mockRejectedValue(new Error("offline"));

		const state = create();
		await flush();
		state.send([expiringPhoto()]);
		await flush();

		expect(offerBypassMock).not.toHaveBeenCalled();
	});
});
