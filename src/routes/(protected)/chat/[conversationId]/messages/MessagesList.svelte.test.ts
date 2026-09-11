// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	messagePropsSeen,
	unsendMessageMock,
	offerBypassMock,
	showErrorToastMock,
} = vi.hoisted(() => ({
	messagePropsSeen: [] as Record<string, unknown>[],
	unsendMessageMock: vi.fn(),
	offerBypassMock: vi.fn(),
	showErrorToastMock: vi.fn(),
}));

vi.mock("./message/Message.svelte", () => ({
	default: (_anchor: unknown, props: Record<string, unknown>) => {
		messagePropsSeen.push(props);
	},
}));
vi.mock("$lib/api/messaging/messages", () => ({
	deleteMessageForMe: vi.fn(),
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
import MessagesList from "./MessagesList.svelte";

const CONVERSATION_ID = "1:2";
const MESSAGE_ID = "m1";
const OUR_ID = 1;

const revert = vi.fn();

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

function renderOwnMessage() {
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
				status: "sent",
			},
		],
		markMessageAsUnsent: vi.fn(() => ({ revert })),
		remove: vi.fn(() => ({ revert: vi.fn() })),
		reactTo: vi.fn(),
		reportRead: vi.fn(),
		setReplyTo: vi.fn(),
	};
	render(MessagesList, { seenMessageIds: new Set<string>() });
	const props = messagePropsSeen.at(-1);
	return props?.onUnsend as () => void;
}

describe("MessagesList unsend", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		messagePropsSeen.length = 0;
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("offers the bypass and puts the message back when unsend is paywalled", async () => {
		unsendMessageMock.mockRejectedValue(paywall());

		const unsend = renderOwnMessage();
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

		const unsend = renderOwnMessage();
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

		const unsend = renderOwnMessage();
		unsend();
		await vi.waitFor(() => expect(showErrorToastMock).toHaveBeenCalled());

		expect(offerBypassMock).not.toHaveBeenCalled();
		expect(revert).toHaveBeenCalledOnce();
	});
});
