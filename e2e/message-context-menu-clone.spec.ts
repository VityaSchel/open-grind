import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	DEMO_CONVERSATION_ID,
	emitMessageSent,
	expiringImageMessage,
	expiringVideoMessage,
	installEventInjection,
	installTauriShim,
	MESSAGE_ROW,
} from "./support/app";
import { CHAT_MEDIA_HOST, serveImages } from "./support/media";

const ME = 123456000;
const THEM = 100001;
const ALBUM = '[aria-label="Open album"]';
const PHOTO = 'a[aria-label="Photo"]';
const QUOTE = '[data-slot="message-quote"]';
const EXPIRING_IMAGE = '[data-slot="expiring-image-message"]';
const EXPIRED_IMAGE = '[data-slot="expiring-image-message-expired"]';
const EXPIRING_VIDEO = '[data-slot="video-message"]';

async function openConversation(page: Page): Promise<void> {
	await serveImages(page, CHAT_MEDIA_HOST);
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(DEMO_CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor({ timeout: 60_000 });
	await page.waitForTimeout(1000);
}

async function receiveMessage(page: Page, message: unknown): Promise<void> {
	await emitMessageSent(page, message);
	await page.waitForTimeout(1000);
}

function ourMessage(timestamp: number) {
	return {
		messageId: `ws-out-${timestamp}`,
		conversationId: DEMO_CONVERSATION_ID,
		senderId: ME,
		timestamp,
		unsent: false,
		reactions: [],
		replyToMessage: null,
	};
}

function theirMessage(timestamp: number) {
	return {
		...ourMessage(timestamp),
		messageId: `ws-in-${timestamp}`,
		senderId: THEM,
	};
}

function outgoingAlbum(timestamp: number) {
	return {
		type: "Album",
		body: {
			albumId: 5001,
			hasUnseenContent: false,
			expiresAt: null,
			expirationType: "INDEFINITE",
			coverUrl: "https://picsum.photos/seed/album-5001-cover/300/400",
			ownerProfileId: ME,
			isViewable: true,
			hasVideo: false,
			hasPhoto: true,
			viewableUntil: null,
		},
		...ourMessage(timestamp),
	};
}

function outgoingImage(timestamp: number) {
	return {
		type: "Image",
		body: {
			mediaId: 987_654,
			width: 600,
			height: 800,
			url: "https://picsum.photos/seed/opengrind-demo/600/800",
			imageHash: "a".repeat(40),
			takenOnGrindr: false,
			createdAt: timestamp,
		},
		...ourMessage(timestamp),
	};
}

function outgoingReply(timestamp: number) {
	return {
		type: "Text",
		body: { text: "Ours" },
		...ourMessage(timestamp),
		replyToMessage: {
			type: "Text",
			body: { text: "Sed do eiusmod tempor incididunt?" },
			messageId: "2:demo-100001-2",
			conversationId: DEMO_CONVERSATION_ID,
			senderId: THEM,
			timestamp: timestamp - 60_000,
			unsent: false,
			reactions: [],
		},
	};
}

async function openContextMenuOf(page: Page, selector: string) {
	const row = page
		.locator(MESSAGE_ROW)
		.filter({ has: page.locator(selector) })
		.last();
	await row.scrollIntoViewIfNeeded();
	await page.waitForTimeout(200);
	const original = await row.locator(selector).boundingBox();
	await row.click({ button: "right" });
	await page.locator("dialog[open]").waitFor();
	await page.waitForTimeout(200);
	return original;
}

async function closeContextMenu(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await expect(page.locator("dialog[open]")).toHaveCount(0);
}

async function expectCloneToMatchOriginal(
	page: Page,
	{ selector, what }: { selector: string; what: string },
): Promise<void> {
	const original = await openContextMenuOf(page, selector);
	expect(original, `the ${what} should be laid out`).not.toBeNull();
	expect(original!.width, `the ${what} should be laid out`).toBeGreaterThan(
		0,
	);

	const clone = page.locator(`dialog[open] ${selector}`);
	await expect(
		clone,
		`the menu should lift a copy of the ${what}`,
	).toHaveCount(1);

	const lifted = await clone.boundingBox();
	expect(lifted, `the lifted ${what} should have a box`).not.toBeNull();
	expect(
		lifted!.width,
		`the lifted ${what} must not collapse to nothing`,
	).toBeGreaterThan(0);
	expect(
		lifted!.height,
		`the lifted ${what} must not collapse to nothing`,
	).toBeGreaterThan(0);
	expect(
		Math.abs(lifted!.width - original!.width),
		`the lifted ${what} should keep the width it had in the thread`,
	).toBeLessThanOrEqual(2);
	expect(
		Math.abs(lifted!.height - original!.height),
		`the lifted ${what} should keep the height it had in the thread`,
	).toBeLessThanOrEqual(2);

	await closeContextMenu(page);
}

test("the context menu lifts an album we received at its real size", async ({
	page,
}) => {
	await openConversation(page);
	await expectCloneToMatchOriginal(page, { selector: ALBUM, what: "album" });
});

test("the context menu lifts an album we sent at its real size", async ({
	page,
}) => {
	await openConversation(page);
	await receiveMessage(page, outgoingAlbum(Date.now() + 60_000));
	await expectCloneToMatchOriginal(page, { selector: ALBUM, what: "album" });
});

test("the context menu lifts a photo we sent at its real size", async ({
	page,
}) => {
	await openConversation(page);
	await receiveMessage(page, outgoingImage(Date.now() + 60_000));
	await expectCloneToMatchOriginal(page, { selector: PHOTO, what: "photo" });
});

test("the context menu lifts an expiring image we sent at its real size", async ({
	page,
}) => {
	await openConversation(page);
	await receiveMessage(
		page,
		expiringImageMessage({ envelope: ourMessage(Date.now() + 60_000) }),
	);
	await expectCloneToMatchOriginal(page, {
		selector: EXPIRING_IMAGE,
		what: "expiring image",
	});
});

test("the context menu lifts an expiring image under a wider quote at its real size", async ({
	page,
}) => {
	await openConversation(page);
	const timestamp = Date.now() + 60_000;
	await receiveMessage(page, {
		...expiringImageMessage({ envelope: ourMessage(timestamp) }),
		replyToMessage: outgoingReply(timestamp).replyToMessage,
	});

	const pill = page.locator(EXPIRING_IMAGE).last();
	const quote = page.locator(QUOTE).last();
	expect(
		(await quote.boundingBox())!.width,
		"the quote should be the wider of the two",
	).toBeGreaterThan((await pill.boundingBox())!.width);

	await expectCloneToMatchOriginal(page, {
		selector: EXPIRING_IMAGE,
		what: "expiring image",
	});
});

test("the context menu lifts an expired image we received at its real size", async ({
	page,
}) => {
	await openConversation(page);
	await receiveMessage(
		page,
		expiringImageMessage({
			envelope: theirMessage(Date.now() + 60_000),
			spent: true,
		}),
	);
	await expectCloneToMatchOriginal(page, {
		selector: EXPIRED_IMAGE,
		what: "expired image",
	});
});

test("the context menu lifts an expiring video we received at its real size", async ({
	page,
}) => {
	await openConversation(page);
	await receiveMessage(
		page,
		expiringVideoMessage({ envelope: theirMessage(Date.now() + 60_000) }),
	);
	await expectCloneToMatchOriginal(page, {
		selector: EXPIRING_VIDEO,
		what: "expiring video",
	});
});

test("the context menu lifts a reply we sent with its quote intact", async ({
	page,
}) => {
	await openConversation(page);
	await receiveMessage(page, outgoingReply(Date.now() + 60_000));

	const original = await openContextMenuOf(page, QUOTE);
	expect(original, "the quote should be laid out").not.toBeNull();

	const lifted = await page.locator(`dialog[open] ${QUOTE}`).boundingBox();
	expect(lifted, "the menu should lift a copy of the quote").not.toBeNull();
	expect(
		Math.abs(lifted!.width - original!.width),
		"the lifted quote should keep the width it had in the thread",
	).toBeLessThanOrEqual(2);

	await closeContextMenu(page);
});
