import { type ElementHandle, expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	DEMO_CONVERSATION,
	emitMessageSent,
	MESSAGE_ROW,
} from "./support/app";
import { openConversation, openInbox, row } from "./support/chat-stack";
import { recordDemoRequests } from "./support/demo-faults";
import {
	type ComposerSheetTrigger,
	DRAWER,
	expandSheet,
	MEDIA_TILE,
	openAttachments,
	openSheetFromComposer,
	SELECTABLE_MEDIA_TILE,
	sheetSnap,
} from "./support/drawer";
import { LIVE_STACK } from "./support/stack-layers";
import {
	gifPanel,
	gifSearchBox,
	gifTiles,
	GIPHY_PAGE_SIZE,
	giphyCalls,
	openStickers,
	refuseRealGiphy,
	SELECTED_STICKER_TILE,
	stickerSendButton,
	stickersTab,
} from "./support/stickers";
import { commitSystemBack, startSystemBack } from "./support/system-back";

const VIEWPORT_HEIGHT = 800;
const SPLIT_MIN_WIDTH = 560;
const PHONE_WIDTH = 420;
const SPLIT_WIDTH = 600;
const CROSSINGS = [
	{ from: 559, to: 560 },
	{ from: 560, to: 559 },
	{ from: 420, to: 600 },
	{ from: 1600, to: 420 },
];
const GIF_QUERY = "party";
const FIRST_PARTY_GIF = "Party GIF 1";
const SECOND_QUERY = "wink";
const FIRST_WINK_GIF = "Wink GIF 1";
const COMPOSER = '[data-slot="message-composer"]';
const MESSAGES_SCROLLER = '[data-slot="messages-scroller"]';
const REPLIABLE_TEXT = "consectetur adipiscing elit";
const OPEN_CHAT_PEER = 100002;
const OTHER_CHAT_PEER = 100009;

function conversationIdWith({ peer }: { peer: number }): string {
	return `${peer}:123456000`;
}

function conversationPathWith({ peer }: { peer: number }): string {
	return `/chat/${conversationIdWith({ peer })}`;
}

function isPhoneWidth(width: number): boolean {
	return width < SPLIT_MIN_WIDTH;
}

function resizeTo(page: Page, { width }: { width: number }): Promise<void> {
	return page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
}

async function crossTo(page: Page, { width }: { width: number }) {
	await resizeTo(page, { width });
	await expect(page.locator(LIVE_STACK.sheet)).toHaveCount(
		isPhoneWidth(width) ? 1 : 0,
	);
	await expect(page.locator(COMPOSER)).toHaveCount(1);
	await expect(page.locator(COMPOSER)).toBeVisible();
	await afterTwoFrames(page);
}

function isConnected(handle: ElementHandle): Promise<boolean> {
	return handle.evaluate((element) => element.isConnected);
}

function attachmentsTab(page: Page, { name }: { name: "Media" | "Albums" }) {
	return page.locator(DRAWER).getByRole("tab", { name });
}

function mediaSendButton(page: Page) {
	return page.locator(DRAWER).getByRole("button", { name: /^Send \d+$/ });
}

function expiringToggle(page: Page) {
	return page
		.locator(DRAWER)
		.getByRole("button", {
			name: "Set photo as expiring after 10 seconds",
		});
}

function selectedMediaTileIndex(page: Page): Promise<number> {
	return page
		.locator(MEDIA_TILE)
		.evaluateAll((tiles) =>
			tiles.findIndex(
				(tile) => tile.getAttribute("aria-pressed") === "true",
			),
		);
}

function partyGif(page: Page) {
	return gifPanel(page).getByRole("button", {
		name: FIRST_PARTY_GIF,
		exact: true,
	});
}

function repliableMessage(page: Page) {
	return conversationMessages(page).filter({ hasText: REPLIABLE_TEXT });
}

function cancelReply(page: Page) {
	return page.getByLabel("Cancel reply");
}

function composerText(page: Page) {
	return page.locator(`${COMPOSER} textarea`);
}

function composerTrigger(
	page: Page,
	{ trigger }: { trigger: ComposerSheetTrigger },
) {
	return page
		.locator(COMPOSER)
		.getByRole("button", { name: trigger, includeHidden: true });
}

async function composerTriggerHandle(
	page: Page,
	{ trigger }: { trigger: ComposerSheetTrigger },
): Promise<ElementHandle> {
	const handle = await composerTrigger(page, { trigger }).elementHandle();
	if (handle === null) throw new Error(`no ${trigger} trigger`);
	return handle;
}

function isFocused(handle: ElementHandle): Promise<boolean> {
	return handle.evaluate((element) => element === document.activeElement);
}

async function countComposerTextFocus(
	page: Page,
): Promise<() => Promise<number>> {
	await page.evaluate((composer) => {
		const state = window as unknown as { __composerTextFocus: number };
		state.__composerTextFocus = 0;
		document.addEventListener(
			"focusin",
			({ target }) => {
				if (
					target instanceof HTMLTextAreaElement &&
					target.closest(composer)
				)
					state.__composerTextFocus += 1;
			},
			{ capture: true },
		);
	}, COMPOSER);
	return () =>
		page.evaluate(
			() =>
				(window as unknown as { __composerTextFocus: number })
					.__composerTextFocus,
		);
}

function conversationMessages(page: Page) {
	return page.locator(`${MESSAGES_SCROLLER} ${MESSAGE_ROW}`);
}

function unreadBadge(page: Page, { peer }: { peer: number }) {
	return page.locator(
		`a[href="${conversationPathWith({ peer })}"] [data-slot="badge"]`,
	);
}

function incomingToast(page: Page, { text }: { text: string }) {
	return page.locator("[data-sonner-toast]", { hasText: text });
}

function incomingText({ peer, text }: { peer: number; text: string }) {
	const timestamp = Date.now() + 60_000;
	return {
		type: "Text",
		body: { text },
		messageId: `ws-${peer}-${timestamp}`,
		conversationId: conversationIdWith({ peer }),
		senderId: peer,
		timestamp,
		unsent: false,
		reactions: [],
		replyToMessage: null,
	};
}

async function seedStickers(page: Page): Promise<() => Promise<void>> {
	await gifSearchBox(page).fill(GIF_QUERY);
	await partyGif(page).click();
	await expandSheet(page);
	await expect.poll(() => sheetSnap(page)).toBe("full");

	const expectKept = async () => {
		await expect(gifSearchBox(page)).toHaveValue(GIF_QUERY);
		await expect(partyGif(page)).toHaveAttribute("aria-pressed", "true");
		await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(1);
		await expect(stickerSendButton(page)).toHaveText("Send GIF");
		await expect(stickersTab(page, { name: "GIFs" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect.poll(() => sheetSnap(page)).toBe("full");
	};
	await expectKept();
	return expectKept;
}

async function seedAttachments(page: Page): Promise<() => Promise<void>> {
	await page.locator(SELECTABLE_MEDIA_TILE).nth(1).click();
	const selectedIndex = await selectedMediaTileIndex(page);
	expect(selectedIndex).toBeGreaterThanOrEqual(0);
	await expect(mediaSendButton(page)).toHaveText("Send 1");
	await expiringToggle(page).click();
	await expect(expiringToggle(page)).toHaveAttribute("aria-pressed", "true");
	await attachmentsTab(page, { name: "Albums" }).click();
	await expandSheet(page);
	await expect.poll(() => sheetSnap(page)).toBe("full");
	await expect(attachmentsTab(page, { name: "Albums" })).toHaveAttribute(
		"aria-selected",
		"true",
	);

	return async () => {
		await expect(attachmentsTab(page, { name: "Albums" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect.poll(() => sheetSnap(page)).toBe("full");
		await attachmentsTab(page, { name: "Media" }).click();
		await expect(mediaSendButton(page)).toHaveText("Send 1");
		expect(await selectedMediaTileIndex(page)).toBe(selectedIndex);
		await expect(expiringToggle(page)).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	};
}

const SHEETS: {
	sheet: string;
	trigger: ComposerSheetTrigger;
	open: (page: Page) => Promise<void>;
	seed: (page: Page) => Promise<() => Promise<void>>;
}[] = [
	{
		sheet: "stickers",
		trigger: "GIFs and stickers",
		open: (page) => openStickers(page),
		seed: seedStickers,
	},
	{
		sheet: "attachments",
		trigger: "Add attachment",
		open: openAttachments,
		seed: seedAttachments,
	},
];

test.beforeEach(async ({ page }) => {
	await refuseRealGiphy(page);
});

for (const { sheet, trigger, open, seed } of SHEETS) {
	test.describe(`an open ${sheet} sheet across the split breakpoint`, () => {
		for (const { from, to } of CROSSINGS) {
			test(`${from}px to ${to}px keeps the same drawer and everything in it`, async ({
				page,
			}) => {
				await resizeTo(page, { width: from });
				await open(page);
				const drawer = await page.locator(DRAWER).elementHandle();
				if (drawer === null) throw new Error("no open drawer");
				const opener = await composerTriggerHandle(page, { trigger });
				const expectKept = await seed(page);

				await crossTo(page, { width: to });

				expect(await isConnected(drawer)).toBe(true);
				expect(await isConnected(opener)).toBe(false);
				await expect(page.locator(DRAWER)).toHaveCount(1);
				await expectKept();

				await page.keyboard.press("Escape");
				await expect(page.locator(DRAWER)).toHaveCount(0);
				expect(await isConnected(drawer)).toBe(false);
				await expect(composerTrigger(page, { trigger })).toBeFocused();
				await composerTrigger(page, { trigger }).click();
				await expect(page.locator(DRAWER)).toHaveCount(1);
			});
		}

		test("without a crossing, Escape hands focus back to the trigger that opened it", async ({
			page,
		}) => {
			await resizeTo(page, { width: PHONE_WIDTH });
			await open(page);
			const opener = await composerTriggerHandle(page, { trigger });
			const selectedTab = page
				.locator(DRAWER)
				.getByRole("tab", { selected: true });
			await selectedTab.focus();
			await expect(selectedTab).toBeFocused();
			expect(await isFocused(opener)).toBe(false);

			await page.keyboard.press("Escape");

			await expect(page.locator(DRAWER)).toHaveCount(0);
			expect(await isConnected(opener)).toBe(true);
			await expect(composerTrigger(page, { trigger })).toBeFocused();
			expect(await isFocused(opener)).toBe(true);
		});
	});
}

test("the GIF feed survives a crossing without asking GIPHY again", async ({
	page,
}) => {
	const requests = await recordDemoRequests(page);
	await resizeTo(page, { width: PHONE_WIDTH });
	await openStickers(page);
	await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
	const firstTile = await gifTiles(page).first().elementHandle();
	if (firstTile === null) throw new Error("no GIF tile");
	const before = giphyCalls(await requests());
	expect(before.map(({ endpoint }) => endpoint)).toEqual(["trending"]);

	await crossTo(page, { width: SPLIT_WIDTH });

	expect(await isConnected(firstTile)).toBe(true);
	await expect(gifTiles(page)).toHaveCount(GIPHY_PAGE_SIZE);
	expect(giphyCalls(await requests())).toEqual(before);

	await gifSearchBox(page).fill(SECOND_QUERY);
	await expect(
		gifPanel(page).getByRole("button", {
			name: FIRST_WINK_GIF,
			exact: true,
		}),
	).toBeVisible();
	expect(
		giphyCalls(await requests())
			.slice(before.length)
			.map(({ endpoint, query }) => ({ endpoint, query })),
	).toEqual([{ endpoint: "search", query: SECOND_QUERY }]);
});

test("Send after a crossing posts into the conversation on screen", async ({
	page,
}) => {
	await resizeTo(page, { width: PHONE_WIDTH });
	await openAttachments(page);
	await page.locator(SELECTABLE_MEDIA_TILE).first().click();
	await expect(mediaSendButton(page)).toHaveText("Send 1");

	await crossTo(page, { width: SPLIT_WIDTH });
	await expect(mediaSendButton(page)).toHaveText("Send 1");
	await expect(conversationMessages(page).first()).toBeVisible();
	const shown = await conversationMessages(page).count();
	await mediaSendButton(page).click();

	await expect(page.locator(DRAWER)).toHaveCount(0);
	await expect(conversationMessages(page)).toHaveCount(shown + 1);
	await expect(conversationMessages(page).last()).toBeInViewport();
});

test.describe("each conversation gets its own stickers sheet", () => {
	test("another conversation opens on an empty GIF search, while the same one keeps its tab", async ({
		page,
	}) => {
		await resizeTo(page, { width: SPLIT_WIDTH });
		await openStickers(page);
		await gifSearchBox(page).fill(GIF_QUERY);
		await expect(partyGif(page)).toBeVisible();
		await stickersTab(page, { name: "Gaymoji" }).click();
		await page.keyboard.press("Escape");
		await expect(page.locator(DRAWER)).toHaveCount(0);

		await openSheetFromComposer(page, { trigger: "GIFs and stickers" });
		await expect(stickersTab(page, { name: "Gaymoji" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await page.keyboard.press("Escape");
		await expect(page.locator(DRAWER)).toHaveCount(0);

		await row(page, {
			href: conversationPathWith({ peer: OTHER_CHAT_PEER }),
		}).click();
		await expect(page).toHaveURL(
			new RegExp(`${conversationPathWith({ peer: OTHER_CHAT_PEER })}$`),
		);
		await openSheetFromComposer(page, { trigger: "GIFs and stickers" });

		await expect(stickersTab(page, { name: "GIFs" })).toHaveAttribute(
			"aria-selected",
			"true",
		);
		await expect(gifSearchBox(page)).toHaveValue("");
	});

	test("a sheet left open stays closed when its conversation comes back", async ({
		page,
	}) => {
		await resizeTo(page, { width: SPLIT_WIDTH });
		await openStickers(page);
		await row(page, {
			href: conversationPathWith({ peer: OTHER_CHAT_PEER }),
		}).evaluate((link: HTMLAnchorElement) => link.click());
		await expect(page).toHaveURL(
			new RegExp(`${conversationPathWith({ peer: OTHER_CHAT_PEER })}$`),
		);
		await expect(page.locator(DRAWER)).toHaveCount(0);

		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`${DEMO_CONVERSATION}$`));
		await expect(page.locator(COMPOSER)).toBeVisible();
		await afterTwoFrames(page);
		expect(await page.locator(DRAWER).count()).toBe(0);

		await openSheetFromComposer(page, { trigger: "GIFs and stickers" });
		await expect(page.locator(DRAWER)).toHaveCount(1);
	});
});

test.describe("the Android back gesture over an open sheet on a phone", () => {
	for (const { sheet, trigger } of SHEETS) {
		for (const { opened, at, crossings } of [
			{ opened: "opened on the phone", at: PHONE_WIDTH, crossings: [] },
			{
				opened: "carried over from the split layout",
				at: SPLIT_WIDTH,
				crossings: [PHONE_WIDTH],
			},
			{
				opened: "carried to the split layout and back",
				at: PHONE_WIDTH,
				crossings: [SPLIT_WIDTH, PHONE_WIDTH],
			},
		]) {
			test(`the ${sheet} sheet ${opened} closes first, and the next Back leaves the conversation`, async ({
				page,
			}) => {
				await resizeTo(page, { width: at });
				await openInbox(page, { platform: "android" });
				const href = await openConversation(page, {
					href: DEMO_CONVERSATION,
				});
				await openSheetFromComposer(page, { trigger });
				for (const width of crossings) await crossTo(page, { width });
				await expect(page.locator(DRAWER)).toHaveCount(1);

				expect(await startSystemBack(page)).toBe(false);
				expect(await commitSystemBack(page)).toBe(false);
				await expect(page.locator(DRAWER)).toHaveCount(0);
				await expect(page).toHaveURL(new RegExp(`${href}$`));

				expect(await startSystemBack(page)).toBe(true);
				expect(await commitSystemBack(page)).toBe(false);
				await expect(page).toHaveURL(/\/chat$/);
			});
		}
	}
});

test.describe("an armed reply under a sheet carried across the split breakpoint", () => {
	for (const { sheet, trigger } of SHEETS) {
		for (const { from, to } of [
			{ from: SPLIT_WIDTH, to: PHONE_WIDTH },
			{ from: PHONE_WIDTH, to: SPLIT_WIDTH },
		]) {
			test(`the ${sheet} sheet from ${from}px to ${to}px leaves focus with the sheet, and Back closes the sheet before canceling the reply`, async ({
				page,
			}) => {
				await resizeTo(page, { width: from });
				await openInbox(page, { platform: "android" });
				const href = await openConversation(page, {
					href: DEMO_CONVERSATION,
				});
				const composerTextFocusCount =
					await countComposerTextFocus(page);
				await repliableMessage(page).click({ button: "right" });
				await page.getByRole("button", { name: "Reply" }).click();
				await expect(cancelReply(page)).toBeVisible();
				await expect(composerText(page)).toBeFocused();
				const focusedByArming = await composerTextFocusCount();
				expect(focusedByArming).toBeGreaterThan(0);
				await openSheetFromComposer(page, { trigger });

				await crossTo(page, { width: to });

				await expect(page.locator(DRAWER)).toHaveCount(1);
				await expect(cancelReply(page)).toBeVisible();
				await afterTwoFrames(page);
				expect(await composerTextFocusCount()).toBe(focusedByArming);

				expect(await commitSystemBack(page)).toBe(false);
				await expect(page.locator(DRAWER)).toHaveCount(0);
				await expect(cancelReply(page)).toBeVisible();
				await expect(composerTrigger(page, { trigger })).toBeFocused();

				expect(await commitSystemBack(page)).toBe(false);
				await expect(cancelReply(page)).toHaveCount(0);
				await expect(page).toHaveURL(new RegExp(`${href}$`));
			});
		}
	}
});

test.describe("the open conversation across the split breakpoint", () => {
	const OPEN_CHAT_TEXT = "for the open chat";
	const OTHER_CHAT_TEXT = "for another chat";

	async function openChatAt(page: Page, { width }: { width: number }) {
		await resizeTo(page, { width });
		await openInbox(page, { platform: "android", injectEvents: true });
		await openConversation(page, {
			href: conversationPathWith({ peer: OPEN_CHAT_PEER }),
		});
	}

	async function deliverToOpenChat(page: Page): Promise<void> {
		await emitMessageSent(
			page,
			incomingText({ peer: OPEN_CHAT_PEER, text: OPEN_CHAT_TEXT }),
		);
		await expect(
			conversationMessages(page).filter({ hasText: OPEN_CHAT_TEXT }),
		).toBeVisible();
	}

	test("from phone to split, a message for it leaves no unread badge, one for another chat does", async ({
		page,
	}) => {
		await openChatAt(page, { width: PHONE_WIDTH });
		await crossTo(page, { width: SPLIT_WIDTH });

		await deliverToOpenChat(page);
		await expect(
			row(page, { href: conversationPathWith({ peer: OPEN_CHAT_PEER }) }),
		).toContainText(OPEN_CHAT_TEXT);
		expect(await unreadBadge(page, { peer: OPEN_CHAT_PEER }).count()).toBe(
			0,
		);

		await emitMessageSent(
			page,
			incomingText({ peer: OTHER_CHAT_PEER, text: OTHER_CHAT_TEXT }),
		);
		await expect(unreadBadge(page, { peer: OTHER_CHAT_PEER })).toHaveText(
			"1",
		);
		expect(await unreadBadge(page, { peer: OPEN_CHAT_PEER }).count()).toBe(
			0,
		);
	});

	test("from split to phone, a message for it raises no toast and no badge, one for another chat does", async ({
		page,
	}) => {
		await openChatAt(page, { width: SPLIT_WIDTH });
		await crossTo(page, { width: PHONE_WIDTH });

		await deliverToOpenChat(page);
		await emitMessageSent(
			page,
			incomingText({ peer: OTHER_CHAT_PEER, text: OTHER_CHAT_TEXT }),
		);

		await expect(
			incomingToast(page, { text: OTHER_CHAT_TEXT }),
		).toBeVisible();
		await expect(unreadBadge(page, { peer: OTHER_CHAT_PEER })).toHaveText(
			"1",
		);
		expect(
			await incomingToast(page, { text: OPEN_CHAT_TEXT }).count(),
		).toBe(0);
		expect(await unreadBadge(page, { peer: OPEN_CHAT_PEER }).count()).toBe(
			0,
		);
	});
});
