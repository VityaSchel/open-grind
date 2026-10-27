import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	DEMO_CONVERSATION_ID,
	emitMessageSent,
	EXPIRED_IMAGE,
	EXPIRING_IMAGE,
	EXPIRING_VIDEO,
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

test("an incoming album reaction keeps its badge and keyboard actions beside the fire", async ({
	page,
}) => {
	await openConversation(page);
	await receiveMessage(page, {
		...theirMessage(Date.now() + 60_000),
		type: "AlbumContentReaction",
		body: {
			albumId: 5001,
			albumContentId: 50011,
			ownerProfileId: THEM,
			previewUrl: "https://picsum.photos/seed/album-5001-cover/300/400",
			viewable: true,
			expiresAt: null,
			contentType: "image/jpeg",
		},
		reactions: [{ profileId: ME, reactionType: 1 }],
	});
	const reaction = page
		.getByRole("article")
		.filter({
			has: page.getByRole("button", {
				name: "Open reacted album content",
			}),
		});
	const fire = reaction.getByRole("img", { name: "Fire reaction" }).first();
	const fireBox = (await fire.boundingBox())!;
	const badge = (await reaction
		.locator('[data-slot="badge"]')
		.boundingBox())!;
	expect(Math.abs(badge.x - (fireBox.x + fireBox.width))).toBeLessThan(24);
	await page.keyboard.press("Tab");
	const actions = reaction.getByRole("button", { name: "Message actions" });
	await actions.focus();
	await expect(actions).toBeVisible();
	const actionsBox = (await actions.boundingBox())!;
	expect(actionsBox.x).toBeGreaterThan(fireBox.x + fireBox.width);
	expect(actionsBox.x - (fireBox.x + fireBox.width)).toBeLessThan(32);
	await actions.press("Enter");
	await expect(page.locator("dialog[open]")).toBeVisible();
	const liftedFire = page
		.locator("dialog[open]")
		.getByRole("img", { name: "Fire reaction" })
		.first();
	expect((await liftedFire.boundingBox())!.x).toBeCloseTo(fireBox.x, 0);
});

for (const type of ["ProfilePhotoReply", "AlbumContentReply"] as const) {
	for (const isOut of [false, true]) {
		test(`${type} menu ignores media actions and dismisses beside the quote, outgoing=${isOut}`, async ({
			page,
		}) => {
			await openConversation(page);
			const text =
				"A long reply that makes the message wider than its quoted media preview.";
			await receiveMessage(page, {
				...(isOut
					? ourMessage(Date.now() + 60_000)
					: theirMessage(Date.now() + 60_000)),
				type,
				body:
					type === "ProfilePhotoReply"
						? { imageHash: "a".repeat(40), photoContentReply: text }
						: {
								albumId: 5001,
								albumContentId: 50011,
								ownerProfileId: THEM,
								previewUrl:
									"https://picsum.photos/seed/album-5001-cover/300/400",
								viewable: true,
								expiresAt: null,
								contentType: "image/jpeg",
								albumContentReply: text,
							},
			});
			await page
				.getByRole("article")
				.filter({ hasText: text })
				.click({ button: "right" });
			const menu = page.locator("dialog[open]");
			await expect(menu).toBeVisible();
			const quote = menu.locator(QUOTE);
			const media = quote.locator("button");
			expect(
				await media.evaluate(
					(button) => button.closest("[inert]") !== null,
				),
			).toBe(true);
			const mediaBox = (await media.boundingBox())!;
			await page.mouse.click(
				mediaBox.x + mediaBox.width / 2,
				mediaBox.y + mediaBox.height / 2,
			);
			await expect(menu).toBeVisible();
			await expect(page.locator(".pswp")).toHaveCount(0);
			await menu.getByText(text, { exact: true }).click();
			await expect(menu).toBeVisible();
			const quoteBox = (await quote.boundingBox())!;
			const bubbleBox = (await menu
				.getByText(text, { exact: true })
				.boundingBox())!;
			const x = isOut ? quoteBox.x - 8 : quoteBox.x + quoteBox.width + 8;
			expect(x).toBeGreaterThan(bubbleBox.x);
			expect(x).toBeLessThan(bubbleBox.x + bubbleBox.width);
			await page.mouse.click(x, quoteBox.y + quoteBox.height / 2);
			await expect(menu).toHaveCount(0);
		});
	}
}
