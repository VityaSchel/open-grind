import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	getConversationMock,
	sendMessageMock,
	offerBypassMock,
	reportRefusedMock,
} = vi.hoisted(() => ({
	getConversationMock: vi.fn(),
	sendMessageMock: vi.fn(),
	offerBypassMock:
		vi.fn<(request: { reason: string }) => Promise<LocationLease | null>>(),
	reportRefusedMock: vi.fn<(error: unknown) => void>(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/entitlements/bypass.svelte", () => ({
	offerEntitlementBypass: offerBypassMock,
	reportRefusedDespiteBypass: reportRefusedMock,
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
import type { LocationLease } from "$lib/entitlements/honduras-hold";
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
const updatePreviewMock = vi.fn();

const delivered = (messageId: string, timestamp: number) => ({
	messageId,
	conversationId: CONVERSATION_ID,
	senderId: PEER_ID,
	timestamp,
	type: "Text" as const,
	body: { text: messageId },
	unsent: false,
	reactions: [],
	replyToMessage: null,
});

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
			updatePreview: updatePreviewMock,
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

const serverCopy = { messageId: "server-1", timestamp: 1234 };

function pendingOffer() {
	const release = vi.fn(() => Promise.resolve());
	const answer = Promise.withResolvers<LocationLease | null>();
	offerBypassMock.mockReturnValueOnce(answer.promise);
	return {
		release,
		accept: () => answer.resolve({ release }),
		decline: () => answer.resolve(null),
	};
}

async function failPhotoPastAllowance() {
	sendMessageMock.mockRejectedValueOnce(entitlementLimit());
	const state = create();
	await flush();
	state.send([expiringPhoto()]);
	await flush();
	return state;
}

describe("ConversationState send failures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getConversationMock.mockResolvedValue({
			messages: [],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		offerBypassMock.mockReturnValue(new Promise(() => {}));
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

		expect(offerBypassMock.mock.calls).toStrictEqual([
			[
				{
					reason: "Daily expiring photo limit reached. Sending more requires a Grindr subscription.",
				},
			],
			[
				{
					reason: "Daily expiring photo limit reached. Sending more requires a Grindr subscription.",
				},
			],
		]);
		expect(state.messages.map((m) => m.status)).toStrictEqual([
			"error",
			"error",
		]);
	});

	it("resends the identical message once the lease arrives and marks the bubble sent with the server id", async () => {
		const offer = pendingOffer();
		const state = await failPhotoPastAllowance();
		sendMessageMock.mockResolvedValue(serverCopy);

		offer.accept();
		await flush();

		expect(sendMessageMock).toHaveBeenCalledTimes(2);
		expect(sendMessageMock.mock.calls[1]).toStrictEqual(
			sendMessageMock.mock.calls[0],
		);
		expect(state.messages[0]?.messageId).toBe("server-1");
		expect(state.messages[0]?.status).toBe("sent");
	});

	it("releases the lease only after the resend settles", async () => {
		const offer = pendingOffer();
		const state = await failPhotoPastAllowance();
		const resend = Promise.withResolvers<typeof serverCopy>();
		sendMessageMock.mockReturnValue(resend.promise);

		offer.accept();
		await flush();
		expect(sendMessageMock).toHaveBeenCalledTimes(2);
		expect(offer.release).not.toHaveBeenCalled();

		resend.resolve(serverCopy);
		await flush();

		expect(offer.release).toHaveBeenCalledExactlyOnceWith();
		expect(state.messages[0]?.status).toBe("sent");
	});

	it("leaves the bubble failed and sends nothing more when the bypass is declined", async () => {
		const offer = pendingOffer();
		const state = await failPhotoPastAllowance();
		sendMessageMock.mockResolvedValue(serverCopy);

		offer.decline();
		await flush();

		expect(sendMessageMock).toHaveBeenCalledOnce();
		expect(state.messages[0]?.status).toBe("error");
		expect(reportRefusedMock).not.toHaveBeenCalled();
	});

	it("sends nothing and still releases the lease when the photo is deleted before the lease arrives", async () => {
		const offer = pendingOffer();
		const state = await failPhotoPastAllowance();
		sendMessageMock.mockResolvedValue(serverCopy);
		state.remove(state.messages[0]!.messageId);

		offer.accept();
		await flush();

		expect(sendMessageMock).toHaveBeenCalledOnce();
		expect(offer.release).toHaveBeenCalledExactlyOnceWith();
		expect(reportRefusedMock).not.toHaveBeenCalled();
		expect(state.messages).toStrictEqual([]);
	});

	it("reports the refusal and still releases the lease when the resend is refused again", async () => {
		const offer = pendingOffer();
		const state = await failPhotoPastAllowance();
		const refusal = entitlementLimit();
		sendMessageMock.mockRejectedValue(refusal);

		offer.accept();
		await flush();

		expect(reportRefusedMock).toHaveBeenCalledOnce();
		expect(reportRefusedMock.mock.calls[0]?.[0]).toBe(refusal);
		expect(offer.release).toHaveBeenCalledExactlyOnceWith();
		expect(offerBypassMock).toHaveBeenCalledOnce();
		expect(state.messages[0]?.status).toBe("error");
		expect(state.messages[0]?.sendError).toBe(refusal);
	});

	it("keeps the last delivered message as the preview when the newest failed one is deleted", async () => {
		getConversationMock.mockResolvedValue({
			messages: [delivered("server-1", 500)],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		sendMessageMock.mockRejectedValue(new Error("offline"));

		const state = create();
		await flush();
		state.send([outbound("Text", { text: "older" })]);
		state.send([outbound("Text", { text: "newer" })]);
		await flush();
		expect(updatePreviewMock).toHaveBeenLastCalledWith({
			conversationId: CONVERSATION_ID,
			preview: expect.objectContaining({
				type: "Text",
				text: "server-1",
			}),
			timestamp: 500,
		});

		updatePreviewMock.mockClear();
		state.remove(state.messages[0]!.messageId);

		expect(updatePreviewMock).not.toHaveBeenCalled();
	});

	it("moves the preview on when the delivered message under a failed one is deleted", async () => {
		getConversationMock.mockResolvedValue({
			messages: [delivered("server-2", 600), delivered("server-1", 500)],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		sendMessageMock.mockRejectedValue(new Error("offline"));

		const state = create();
		await flush();
		state.send([outbound("Text", { text: "failed" })]);
		await flush();
		state.remove("server-2");

		expect(updatePreviewMock).toHaveBeenLastCalledWith({
			conversationId: CONVERSATION_ID,
			preview: expect.objectContaining({ text: "server-1" }),
			timestamp: 500,
		});
	});

	it("keeps a newer pending message as the preview when an older send fails", async () => {
		let rejectOlder!: (error: Error) => void;
		sendMessageMock
			.mockReturnValueOnce(
				new Promise((_, reject) => {
					rejectOlder = reject;
				}),
			)
			.mockReturnValueOnce(new Promise(() => {}));

		const state = create();
		await flush();
		state.send([outbound("Text", { text: "older" })]);
		state.send([outbound("Text", { text: "newer" })]);
		rejectOlder(new Error("offline"));
		await flush();

		expect(updatePreviewMock).toHaveBeenLastCalledWith({
			conversationId: CONVERSATION_ID,
			preview: expect.objectContaining({ text: "newer" }),
			timestamp: expect.any(Number),
		});
	});

	it("keeps a failed message out of the preview when a refresh brings new messages", async () => {
		getConversationMock.mockResolvedValue({
			messages: [delivered("server-1", 500)],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		sendMessageMock.mockRejectedValue(new Error("offline"));

		const state = create();
		await flush();
		state.send([outbound("Text", { text: "failed" })]);
		await flush();

		getConversationMock.mockResolvedValue({
			messages: [delivered("server-2", 600), delivered("server-1", 500)],
			profile,
			pageKey: null,
			lastReadTimestamp: null,
		});
		await state.refresh();

		expect(state.messages[0]?.status).toBe("error");
		expect(updatePreviewMock).toHaveBeenLastCalledWith({
			conversationId: CONVERSATION_ID,
			preview: expect.objectContaining({ text: "server-2" }),
			timestamp: 600,
		});
	});

	it("keeps a failed message out of the preview when an older-stamped send lands under it", async () => {
		const clock = vi.spyOn(Date, "now");
		sendMessageMock
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce({ messageId: "server-1", timestamp: 900 });

		const state = create();
		await flush();
		clock.mockReturnValue(1000);
		state.send([outbound("Text", { text: "failed" })]);
		await flush();
		clock.mockReturnValue(2000);
		state.send([outbound("Text", { text: "landed" })]);
		await flush();

		expect(state.messages.map((m) => m.status)).toEqual(["error", "sent"]);
		expect(updatePreviewMock).toHaveBeenLastCalledWith({
			conversationId: CONVERSATION_ID,
			preview: expect.objectContaining({ text: "landed" }),
			timestamp: 900,
		});
	});

	it("puts the failed bubble back to pending and holds the lease while the resend is in flight", async () => {
		const offer = pendingOffer();
		const state = await failPhotoPastAllowance();
		expect(state.messages[0]?.status).toBe("error");
		sendMessageMock.mockReturnValue(new Promise(() => {}));

		offer.accept();
		await flush();

		expect(sendMessageMock).toHaveBeenCalledTimes(2);
		expect(state.messages[0]?.status).toBe("pending");
		expect(state.messages[0]?.sendError).toBeUndefined();
		expect(offer.release).not.toHaveBeenCalled();
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
