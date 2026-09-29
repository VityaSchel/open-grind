// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	messagePropsSeen,
	deleteMessageForMeMock,
	unsendMessageMock,
	offerBypassMock,
	showErrorToastMock,
	setMediaRenewalMock,
} = vi.hoisted(() => ({
	messagePropsSeen: [] as Record<string, unknown>[],
	deleteMessageForMeMock: vi.fn(),
	unsendMessageMock: vi.fn(),
	offerBypassMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	setMediaRenewalMock: vi.fn(),
}));

vi.mock("./message/Message.svelte", () => ({
	default: (_anchor: unknown, props: Record<string, unknown>) => {
		messagePropsSeen.push(props);
	},
}));
vi.mock("./message/media-renewal", () => ({
	setMediaRenewal: setMediaRenewalMock,
}));
vi.mock("$lib/api/messaging/messages", () => ({
	deleteMessageForMe: deleteMessageForMeMock,
	unsendMessage: unsendMessageMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/error-copy", () => ({ promptCopyError: vi.fn() }));
vi.mock("$lib/entitlements/bypass.svelte", () => ({
	offerEntitlementBypass: offerBypassMock,
}));

const conversationState = vi.hoisted<{ current: unknown }>(() => ({
	current: null,
}));
vi.mock("../conversation-state.svelte", () => ({
	getConversationState: () => () => conversationState.current,
}));

import { ApiError } from "$lib/api/api-error";
import type { OptimisticMessage } from "../merge-messages";
import MessagesList from "./MessagesList.svelte";

const CONVERSATION_ID = "1:2";
const MESSAGE_ID = "m1";
const OUR_ID = 1;

const revert = vi.fn();
const renewMediaMock = vi.fn(() => Promise.resolve());
const remove = vi.fn(() => ({ revert: vi.fn() }));

const paywall = () =>
	new ApiError({
		message: "API request failed with status 402",
		request: { method: "POST", path: "/v4/chat/message/unsend" },
		response: {
			status: 402,
			body: JSON.stringify({
				type: "urn:gr:err:tiered_feature",
				featureValue: "UnsentMessage",
			}),
		},
	});

function renderOwnMessage({
	status = "sent",
}: { status?: OptimisticMessage["status"] } = {}) {
	conversationState.current = {
		conversationId: CONVERSATION_ID,
		ourProfileId: OUR_ID,
		lastReadTimestamp: null,
		messages: [
			{
				messageId: MESSAGE_ID,
				conversationId: CONVERSATION_ID,
				senderId: OUR_ID,
				timestamp: 1000,
				type: "Text",
				body: { text: "hi" },
				reactions: [],
				unsent: false,
				status,
			},
		],
		markMessageAsUnsent: vi.fn(() => ({ revert })),
		remove,
		reactTo: vi.fn(),
		reportRead: vi.fn(),
		setReplyTo: vi.fn(),
		dynamicRefresh: { renewMedia: renewMediaMock },
	};
	render(MessagesList, { seenMessageIds: new Set<string>() });
	expect(messagePropsSeen).toHaveLength(1);
	return messagePropsSeen[0]!;
}

beforeEach(() => {
	vi.clearAllMocks();
	messagePropsSeen.length = 0;
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("MessagesList media renewal", () => {
	it("lets its messages renew the chat's signed media", async () => {
		renderOwnMessage();
		const renew = setMediaRenewalMock.mock.lastCall?.[0] as () => unknown;

		await renew();

		expect(renewMediaMock).toHaveBeenCalledOnce();
	});
});

describe("MessagesList actions", () => {
	it("deletes a sent message on the server", async () => {
		const { onDelete } = renderOwnMessage();
		await (onDelete as () => Promise<void>)();

		expect(remove).toHaveBeenCalledWith(MESSAGE_ID);
		expect(deleteMessageForMeMock).toHaveBeenCalledWith({
			conversationId: CONVERSATION_ID,
			messageId: MESSAGE_ID,
		});
	});

	it("deletes a message that failed to send without asking the server", async () => {
		const { onDelete } = renderOwnMessage({ status: "error" });
		await (onDelete as () => Promise<void>)();

		expect(remove).toHaveBeenCalledWith(MESSAGE_ID);
		expect(deleteMessageForMeMock).not.toHaveBeenCalled();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("puts a sent message back when deleting it fails", async () => {
		deleteMessageForMeMock.mockRejectedValueOnce(new Error("offline"));

		const { onDelete } = renderOwnMessage();
		await (onDelete as () => Promise<void>)();

		expect(showErrorToastMock).toHaveBeenCalledWith(
			expect.objectContaining({ label: "Failed to delete message" }),
		);
		expect(remove.mock.results[0]!.value.revert).toHaveBeenCalledOnce();
	});

	it("offers neither delete nor unsend while a message is still sending", () => {
		const { onDelete, onUnsend } = renderOwnMessage({ status: "pending" });

		expect(onDelete).toBeUndefined();
		expect(onUnsend).toBeUndefined();
	});

	it("offers no unsend for a message that failed to send", () => {
		expect(renderOwnMessage({ status: "error" }).onUnsend).toBeUndefined();
	});
});

describe("MessagesList unsend", () => {
	it("offers the bypass and puts the message back when unsend is paywalled", async () => {
		unsendMessageMock.mockRejectedValue(paywall());

		const unsend = renderOwnMessage().onUnsend as () => void;
		unsend();
		await vi.waitFor(() => expect(offerBypassMock).toHaveBeenCalled());

		expect(revert).toHaveBeenCalledOnce();
		expect(offerBypassMock).toHaveBeenCalledWith({
			reason: "Unsending a message requires a Grindr subscription.",
			retry: expect.any(Function),
		});
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("unsends again when the bypass retries it", async () => {
		unsendMessageMock.mockRejectedValueOnce(paywall());

		const unsend = renderOwnMessage().onUnsend as () => void;
		unsend();
		await vi.waitFor(() => expect(offerBypassMock).toHaveBeenCalled());

		unsendMessageMock.mockResolvedValue(undefined);
		const { retry } = offerBypassMock.mock.calls[0]?.[0] as {
			retry: () => Promise<void>;
		};
		await retry();

		expect(unsendMessageMock).toHaveBeenNthCalledWith(2, {
			conversationId: CONVERSATION_ID,
			messageId: MESSAGE_ID,
		});
		expect(revert).toHaveBeenCalledOnce();
	});

	it("falls back to a toast for a plain unsend failure", async () => {
		unsendMessageMock.mockRejectedValue(new Error("offline"));

		const unsend = renderOwnMessage().onUnsend as () => void;
		unsend();
		await vi.waitFor(() => expect(showErrorToastMock).toHaveBeenCalled());

		expect(offerBypassMock).not.toHaveBeenCalled();
		expect(revert).toHaveBeenCalledOnce();
	});
});
