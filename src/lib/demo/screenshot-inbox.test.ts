import { afterEach, describe, expect, it, vi } from "vitest";
import z from "zod";

const flags = vi.hoisted(() => ({ screenshots: true }));

vi.mock("$lib/demo/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./config")>();
	return {
		...actual,
		get screenshotsEnabled() {
			return flags.screenshots;
		},
	};
});

import { conversationEntrySchema } from "$lib/model/messaging/conversations";
import {
	previewFromMessage,
	previewLabel,
	quoteLabel,
} from "$lib/model/messaging/message-preview";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";
import type { DemoInbox } from "./mock/conversation-seeds";
import { conversationIdFor } from "./mock/conversations";
import { demoRoute } from "./route";
import { screenshotScene } from "./screenshot-scene";

const QUOTING_ID = 100004;
const NAMELESS_ID = 100003;
const DEFAULT_DEMO_ID = 100001;

const inbox: DemoInbox = {
	nextPage: 2,
	conversations: [
		{
			withId: QUOTING_ID,
			unread: 0,
			pinned: false,
			favorite: false,
			muted: false,
			lastActivityAgo: 0,
			hidesDistance: true,
			messages: [
				{
					fromMe: false,
					kind: "wire",
					type: "Location",
					body: { lat: 10, lon: -35 },
				},
				{
					fromMe: true,
					text: "Lorem ipsum",
					quote: {
						fromMe: false,
						kind: "wire",
						type: "Giphy",
						body: {
							id: "fixture",
							urlPath: "https://picsum.photos/seed/gif/200/200",
							stillPath:
								"https://picsum.photos/seed/still/200/200",
							previewPath: "fixture",
							width: 200,
							height: 200,
							imageHash: "fixture",
						},
					},
				},
			],
		},
		{
			withId: NAMELESS_ID,
			name: "",
			unread: 120,
			pinned: true,
			favorite: false,
			muted: true,
			lastActivityAgo: 1500,
			messages: [{ fromMe: false, kind: "image" }],
		},
	],
};

const inboxResponseSchema = z.object({
	entries: z.array(conversationEntrySchema),
	nextPage: z.number().nullable(),
});

const messagesResponseSchema = z.object({
	messages: z.array(apiResponseMessageSchema),
	profile: z.object({
		distance: z.number().nullable(),
		showDistance: z.boolean(),
	}),
});

function route({ path, method = "GET" }: { path: string; method?: string }) {
	return demoRoute({ path, method, body: {} }).body;
}

function inboxPage(page: number) {
	return inboxResponseSchema.parse(
		route({ path: `/v4/inbox?page=${page}`, method: "POST" }),
	);
}

function messagesOf(withId: number) {
	return messagesResponseSchema.parse(
		route({
			path: `/v5/chat/conversation/${conversationIdFor(withId)}/message?profile=true`,
		}),
	);
}

afterEach(() => {
	screenshotScene.inbox = null;
	flags.screenshots = true;
});

describe("a scene's inbox", () => {
	it("lists only the scene's conversations and its next page", () => {
		screenshotScene.inbox = inbox;
		const { entries, nextPage } = inboxPage(1);
		expect(
			entries.map(({ data }) => data.participants[0]?.profileId),
		).toEqual([QUOTING_ID, NAMELESS_ID]);
		expect(nextPage).toBe(2);
		expect(inboxPage(2).entries).toEqual([]);
	});

	it("keeps a scene's empty name and previews its last message", () => {
		screenshotScene.inbox = inbox;
		const nameless = inboxPage(1).entries.find(
			({ data }) => data.participants[0]?.profileId === NAMELESS_ID,
		);
		expect(nameless?.data).toMatchObject({
			name: "",
			unreadCount: 120,
			pinned: true,
			muted: true,
		});
		expect(previewLabel(nameless?.data.preview)).toBe("Photo");
	});

	it("builds wire messages and quotes that the real schemas accept", () => {
		screenshotScene.inbox = inbox;
		const [reply, location] = messagesOf(QUOTING_ID).messages;
		expect(location?.type).toBe("Location");
		expect(reply?.type).toBe("Text");
		const quoted = reply?.replyToMessage;
		expect(quoted?.type).toBe("Giphy");
		expect(quoteLabel(previewFromMessage(quoted ?? undefined))).toBe("GIF");
	});

	it("hides the distance of a conversation that asks for it", () => {
		screenshotScene.inbox = inbox;
		expect(messagesOf(QUOTING_ID).profile).toEqual({
			distance: null,
			showDistance: false,
		});
		expect(messagesOf(NAMELESS_ID).profile.distance).not.toBeNull();
	});

	it("answers single messages from the scene's threads", () => {
		screenshotScene.inbox = inbox;
		const conversationId = conversationIdFor(QUOTING_ID);
		const [, location] = messagesOf(QUOTING_ID).messages;
		const { message } = z
			.object({ message: apiResponseMessageSchema })
			.parse(
				route({
					path: `/v4/chat/conversation/${conversationId}/message/${location?.messageId}`,
				}),
			);
		expect(message.type).toBe("Location");
	});

	it("keeps the demo conversations without the flag", () => {
		flags.screenshots = false;
		screenshotScene.inbox = inbox;
		const ids = inboxPage(1).entries.map(
			({ data }) => data.participants[0]?.profileId,
		);
		expect(ids).toContain(DEFAULT_DEMO_ID);
		expect(ids).not.toContain(NAMELESS_ID);
		expect(inboxPage(1).nextPage).toBeNull();
	});
});
