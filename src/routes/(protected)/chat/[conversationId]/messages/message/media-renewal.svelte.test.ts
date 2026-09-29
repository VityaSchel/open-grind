// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { renewMock } = vi.hoisted(() => ({
	renewMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("./media-renewal", () => ({ mediaRenewal: () => renewMock }));
vi.mock("../../conversation-state.svelte", () => ({
	getConversationState: () => () => ({ profile: null }),
}));
vi.mock("$lib/platform/media-failure", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/platform/media-failure")>()),
	explainsMediaFailures: () => true,
	mediaFailure: () =>
		Promise.resolve({
			kind: "status",
			status: 403,
			phase: null,
			host: "d3.cloudfront.net",
			signatureExpired: false,
		}),
}));

import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import Message from "./Message.svelte";

const URL =
	"https://d3.cloudfront.net/chat/p.jpg?Expires=1700000900&Signature=S&Key-Pair-Id=K";

const photo = {
	type: "Image",
	body: {
		mediaId: 1,
		width: 300,
		height: 400,
		url: URL,
		imageHash: "a".repeat(64),
		takenOnGrindr: false,
		createdAt: null,
	},
};

const album = {
	type: "Album",
	body: {
		albumId: 7,
		hasUnseenContent: false,
		expiresAt: null,
		coverUrl: URL,
		ownerProfileId: 2,
		isViewable: true,
		hasVideo: false,
		hasPhoto: true,
	},
};

async function refusedTile(kind: { type: string; body: unknown }) {
	const { container } = render(Message, {
		props: {
			message: apiResponseMessageSchema.parse({
				messageId: "m1",
				conversationId: "100001:100002",
				senderId: 100002,
				timestamp: 1_700_000_000_000,
				...kind,
			}),
			isOut: false,
			isRead: null,
			indexInStack: 0,
			stackLength: 1,
		},
	});
	const image = container.querySelector("img");
	if (image === null) throw new Error("no media image");
	await fireEvent.error(image);
	await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => renewMock.mockClear());
afterEach(() => cleanup());

describe("chat media renewal", () => {
	it("renews the chat when a photo's signature is refused", async () => {
		await refusedTile(photo);

		expect(renewMock).toHaveBeenCalledOnce();
	});

	it("renews the chat when an album cover's signature is refused", async () => {
		await refusedTile(album);

		expect(renewMock).toHaveBeenCalledOnce();
	});
});
