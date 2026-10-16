import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import type { ApiResponseMessage } from "$lib/model/messaging/messages";
import type { Announcement } from "./types";

const push = vi.hoisted(() => ({
	notify: vi.fn<(announcement: Announcement) => Promise<void>>(),
}));
const os = vi.hoisted(() => ({ desktop: true }));

vi.mock("./index", () => push);
vi.mock("$lib/platform/os", () => ({ isDesktopPlatform: () => os.desktop }));

const { announceMessage, announceTap } = await import("./announce");

const CONVERSATION_ID = "100001:123456000";

function message(type: string, body: object): ApiResponseMessage {
	return {
		messageId: "m1",
		conversationId: CONVERSATION_ID,
		senderId: 100001,
		timestamp: 1_710_000_000_000,
		unsent: false,
		reactions: [],
		type,
		body,
	} as unknown as ApiResponseMessage;
}

function announced(): Announcement | undefined {
	return push.notify.mock.calls[0]?.[0];
}

beforeEach(() => {
	push.notify.mockReset();
	push.notify.mockResolvedValue();
	os.desktop = true;
});

describe("announcing on desktop", () => {
	it("shows what a text message says, under its chat", () => {
		announceMessage({
			message: message("Text", { text: "hey there" }),
			sender: "James",
		});

		expect(announced()).toEqual({
			category: "messages",
			tag: CONVERSATION_ID,
			messageId: "m1",
			title: "James",
			body: "hey there",
			deeplink: "grindr://conversation?id=100001%3A123456000",
		});
	});

	it.each([
		["Image", { imageHash: "a" }, "Sent you a picture"],
		["Album", { albumId: 1 }, "Shared their album"],
		["Giphy", { id: "g" }, "Sent you a GIF"],
		["Audio", { url: "a" }, "Sent you an audio message"],
		["VideoCall", {}, "Sent you a message"],
	])("describes a %s message the way Android does", (type, body, said) => {
		announceMessage({ message: message(type, body), sender: "James" });

		expect(announced()?.body).toBe(said);
	});

	it("prefers the words of a reply over its kind", () => {
		announceMessage({
			message: message("ProfilePhotoReply", {
				imageHash: "a",
				photoContentReply: "nice pic",
			}),
			sender: "James",
		});

		expect(announced()?.body).toBe("nice pic");
	});

	it("names an unnamed sender Someone", () => {
		announceMessage({
			message: message("Text", { text: "hi" }),
			sender: "",
		});

		expect(announced()?.title).toBe("Someone");
	});

	it("shows a tap under its sender and opens the taps list", () => {
		announceTap({ senderId: 42, senderName: null });

		expect(announced()).toEqual({
			category: "taps",
			tag: "tap:42",
			messageId: null,
			title: "Someone",
			body: "Tapped you",
			deeplink: "grindr://taps-inbox",
		});
	});
});

describe("announcing in the app's language", () => {
	afterEach(async () => {
		await setLocale({ locale: SOURCE_LOCALE });
	});

	it("words an unnamed sender and the kind of a message in it", async () => {
		await setLocale({ locale: "en-XA" });

		announceMessage({
			message: message("Image", { imageHash: "a" }),
			sender: "",
		});

		expect(announced()?.title).toMatch(PSEUDO_MESSAGE);
		expect(announced()?.body).toMatch(PSEUDO_MESSAGE);
	});

	it("words a tap in it", async () => {
		await setLocale({ locale: "en-XA" });

		announceTap({ senderId: 42, senderName: null });

		expect(announced()?.title).toMatch(PSEUDO_MESSAGE);
		expect(announced()?.body).toMatch(PSEUDO_MESSAGE);
	});

	it("keeps the words a message says", async () => {
		await setLocale({ locale: "en-XA" });

		announceMessage({
			message: message("Text", { text: "hey there" }),
			sender: "James",
		});

		expect(announced()?.title).toBe("James");
		expect(announced()?.body).toBe("hey there");
	});
});

describe("announcing on Android", () => {
	it("leaves notifications to the system side", () => {
		os.desktop = false;

		announceMessage({
			message: message("Text", { text: "hi" }),
			sender: "James",
		});
		announceTap({ senderId: 42, senderName: "James" });

		expect(push.notify).not.toHaveBeenCalled();
	});
});
