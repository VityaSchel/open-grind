import { expect, type Page, test } from "@playwright/test";

import { emitMessageSent, FIRST_ROUTE_COMPILE_MS } from "./support/app";
import {
	backToChats,
	base,
	listScroller,
	openConversation,
	openInbox,
	row,
	rows,
	SHEET,
	sheet,
	WIDE,
} from "./support/chat-stack";
import {
	type Keyboard,
	sendInsets,
	switchKeyboardAtOnce,
} from "./support/keyboard";
import { pauseMidSlide, resumeSlides } from "./support/stack-layers";
import {
	cancelSystemBack,
	commitSystemBack,
	progressSystemBack,
	startSystemBack,
} from "./support/system-back";

const SHORT_PHONE = { width: 390, height: 520 };
const READ_CONVERSATION = "/chat/100250:123456000";
const QUIET_PEER = 100002;
const QUIET_CONVERSATION_ID = `${QUIET_PEER}:123456000`;
const LATE_TEXT = "arrived while covered";
const LIST_OFFSET = 240;
const PAINTED_SHADES = 12;
const KEYBOARD_HEIGHT = 240;
const KEYBOARD_CLOSED: Keyboard = {
	viewport: SHORT_PHONE,
	insets: { top: 0, bottom: 48, left: 0, right: 0, ime: false },
};
const KEYBOARD_OPEN: Keyboard = {
	viewport: { ...SHORT_PHONE, height: SHORT_PHONE.height - KEYBOARD_HEIGHT },
	insets: { ...KEYBOARD_CLOSED.insets, bottom: 0, ime: true },
};

const listIsRendered = (page: Page) =>
	listScroller(page).evaluate((scroller) => scroller.checkVisibility());

const listSnapshot = (page: Page) =>
	listScroller(page).evaluate((scroller) => ({
		scrollTop: scroller.scrollTop,
		rows: [...scroller.querySelectorAll<HTMLElement>('a[href^="/chat/"]')]
			.filter((row) => row.getClientRects().length > 0)
			.map((row) => ({
				href: row.getAttribute("href"),
				top: Math.round(row.getBoundingClientRect().top),
				unread:
					row.querySelector('[data-slot="badge"]')?.textContent ??
					null,
			})),
	}));

async function openScrolledInbox(page: Page) {
	await openInbox(page, { platform: "android" });
	await listScroller(page).evaluate((scroller, top) => {
		scroller.scrollTop = top;
	}, LIST_OFFSET);
	const before = await listSnapshot(page);
	expect(before.scrollTop).toBe(LIST_OFFSET);
	expect(before.rows.length).toBeGreaterThan(5);
	return before;
}

async function shadesInStrip(page: Page, { width }: { width: number }) {
	const strip = await page.screenshot({
		clip: { x: 0, y: 0, width, height: SHORT_PHONE.height },
		caret: "hide",
	});
	return page.evaluate(async (base64) => {
		const response = await fetch(`data:image/png;base64,${base64}`);
		const bitmap = await createImageBitmap(await response.blob());
		const context = new OffscreenCanvas(
			bitmap.width,
			bitmap.height,
		).getContext("2d");
		if (!context) throw new Error("no 2d context");
		context.drawImage(bitmap, 0, 0);
		const { data } = context.getImageData(
			0,
			0,
			bitmap.width,
			bitmap.height,
		);
		const shades = new Set<number>();
		for (let at = 0; at < data.length; at += 4)
			shades.add(
				((data[at] ?? 0) << 16) |
					((data[at + 1] ?? 0) << 8) |
					(data[at + 2] ?? 0),
			);
		return shades.size;
	}, strip.toString("base64"));
}

async function expectListPaintedInStrip(
	page: Page,
	{ width }: { width: number },
) {
	const showContent = (shown: boolean) =>
		base(page).evaluate((pane, shown) => {
			for (const child of pane.children)
				(child as HTMLElement).style.opacity = shown ? "" : "0";
		}, shown);
	const shown = await shadesInStrip(page, { width });
	await showContent(false);
	const blank = await shadesInStrip(page, { width });
	await showContent(true);
	expect(blank, "an unpainted list is a flat strip").toBeLessThan(
		PAINTED_SHADES,
	);
	expect(shown, "rows show in the uncovered strip").toBeGreaterThan(
		PAINTED_SHADES * 4,
	);
}

const bottomInset = (page: Page) =>
	page.evaluate(() =>
		document.documentElement.style.getPropertyValue("--safe-area-bottom"),
	);

async function watchLayoutReadsUnderTheSheet(page: Page) {
	await base(page).evaluate((pane) => {
		const reads: string[] = [];
		const note = ({ api, target }: { api: string; target: Element }) => {
			if (target !== pane && pane.contains(target))
				reads.push(`${api} on ${target.tagName.toLowerCase()}`);
		};
		for (const api of [
			"getBoundingClientRect",
			"getClientRects",
		] as const) {
			const read: (this: Element) => DOMRect | DOMRectList =
				Element.prototype[api];
			Object.assign(Element.prototype, {
				[api](this: Element) {
					note({ api, target: this });
					return read.call(this);
				},
			});
		}
		const readStyle = window.getComputedStyle;
		window.getComputedStyle = (target, pseudo) => {
			note({ api: "getComputedStyle", target });
			return readStyle(target, pseudo);
		};
		Object.assign(window, { __layoutReads: reads });
	});
	return () =>
		page.evaluate(
			() =>
				(window as unknown as { __layoutReads: string[] })
					.__layoutReads,
		);
}

test.describe("the list a conversation covers on a phone", () => {
	test.use({ viewport: SHORT_PHONE });

	test("leaves rendering once the conversation has slid in and stays mounted", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		expect(await listIsRendered(page)).toBe(true);
		const mounted = listScroller(page).locator('a[href^="/chat/"]');
		const mountedBefore = await mounted.count();
		expect(mountedBefore).toBeGreaterThan(5);

		const sliding = pauseMidSlide(page, { pane: SHEET });
		await rows(page).nth(1).click();
		await sliding;
		expect(
			await listIsRendered(page),
			"still rendered while the conversation slides in",
		).toBe(true);
		await resumeSlides(page);

		await expect(base(page)).toHaveCSS("content-visibility", "hidden");
		expect(await listIsRendered(page)).toBe(false);
		expect(await mounted.count()).toBe(mountedBefore);
	});

	test("Back shows the list painted from the first frame, at the same scroll position with the same rows", async ({
		page,
	}) => {
		const before = await openScrolledInbox(page);
		await openConversation(page, { href: READ_CONVERSATION });
		expect(await listIsRendered(page)).toBe(false);

		const frames = page.evaluate(
			(selector) =>
				new Promise<{ sheetX: number; listRendered: boolean }[]>(
					(resolve) => {
						const seen: {
							sheetX: number;
							listRendered: boolean;
						}[] = [];
						const sample = () => {
							const pane = document.querySelector(selector);
							if (!pane) return resolve(seen);
							seen.push({
								sheetX: pane.getBoundingClientRect().x,
								listRendered:
									document
										.querySelector(
											'[data-slot="conversations-scroller"]',
										)
										?.checkVisibility() ?? false,
							});
							requestAnimationFrame(sample);
						};
						requestAnimationFrame(sample);
					},
				),
			SHEET,
		);
		const paused = pauseMidSlide(page, { pane: SHEET });
		await backToChats(page).click();
		const edge = await paused;

		await expectListPaintedInStrip(page, { width: Math.floor(edge) });
		expect(await listSnapshot(page)).toEqual(before);

		await resumeSlides(page);
		const moved = (await frames).filter(({ sheetX }) => sheetX > 0);
		expect(moved.length).toBeGreaterThan(3);
		expect(moved.filter(({ listRendered }) => !listRendered)).toEqual([]);
		await expect(sheet(page)).toHaveCount(0);
		expect(await listSnapshot(page)).toEqual(before);
	});

	test("Back shows a list first mounted under the conversation at the same scroll position with the same rows", async ({
		page,
	}) => {
		const before = await openScrolledInbox(page);
		await openConversation(page, { href: READ_CONVERSATION });
		await sheet(page).locator('a[href^="/profile/"]').click();
		await expect(page).toHaveURL(/\/profile\//, {
			timeout: FIRST_ROUTE_COMPILE_MS,
		});
		await expect(base(page)).toHaveCount(0);

		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`${READ_CONVERSATION}$`));
		await expect(base(page)).toHaveCSS("content-visibility", "hidden");
		await expect(
			listScroller(page).locator('a[href^="/chat/"]').first(),
		).toBeAttached();
		expect(await listIsRendered(page)).toBe(false);

		const paused = pauseMidSlide(page, { pane: SHEET });
		await backToChats(page).click();
		await paused;
		expect(await listSnapshot(page)).toEqual(before);

		await resumeSlides(page);
		await expect(sheet(page)).toHaveCount(0);
		expect(await listSnapshot(page)).toEqual(before);
	});

	test("the system back gesture shows the list painted as soon as the conversation moves and lands on the same scroll position and rows", async ({
		page,
	}) => {
		const before = await openScrolledInbox(page);
		await openConversation(page, { href: READ_CONVERSATION });
		expect(await listIsRendered(page)).toBe(false);

		expect(await startSystemBack(page)).toBe(true);
		await progressSystemBack(page, 0.3);
		expect(await listIsRendered(page)).toBe(true);
		await expectListPaintedInStrip(page, {
			width: Math.floor(SHORT_PHONE.width * 0.3),
		});
		expect(await listSnapshot(page)).toEqual(before);

		expect(await commitSystemBack(page)).toBe(false);
		await expect(page).toHaveURL(/\/chat$/);
		await expect(sheet(page)).toHaveCount(0);
		expect(await listSnapshot(page)).toEqual(before);
	});

	test("a canceled back gesture takes the list out of rendering again without losing its place", async ({
		page,
	}) => {
		const before = await openScrolledInbox(page);
		await openConversation(page, { href: READ_CONVERSATION });

		expect(await startSystemBack(page)).toBe(true);
		await progressSystemBack(page, 0.4);
		expect(await listIsRendered(page)).toBe(true);
		await cancelSystemBack(page);

		await expect(base(page)).toHaveCSS("content-visibility", "hidden");
		expect(await listIsRendered(page)).toBe(false);

		await backToChats(page).click();
		await expect(sheet(page)).toHaveCount(0);
		expect(await listSnapshot(page)).toEqual(before);
	});

	test("the keyboard opening and closing over a conversation reads no layout from the covered list", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		await openConversation(page, { href: READ_CONVERSATION });
		await sendInsets(page, KEYBOARD_CLOSED.insets);
		const layoutReads = await watchLayoutReadsUnderTheSheet(page);

		await switchKeyboardAtOnce(page, KEYBOARD_OPEN);
		await expect.poll(() => bottomInset(page)).toBe("0px");
		await switchKeyboardAtOnce(page, KEYBOARD_CLOSED);
		await expect.poll(() => bottomInset(page)).toBe("48px");

		expect(await layoutReads()).toEqual([]);
		expect(await listIsRendered(page)).toBe(false);
	});

	test("a message that arrives for a covered row shows on it after Back", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android", injectEvents: true });
		await openConversation(page, { href: READ_CONVERSATION });
		expect(await listIsRendered(page)).toBe(false);

		const timestamp = Date.now() + 60_000;
		await emitMessageSent(page, {
			type: "Text",
			body: { text: LATE_TEXT },
			messageId: `ws-text-${timestamp}`,
			conversationId: QUIET_CONVERSATION_ID,
			senderId: QUIET_PEER,
			timestamp,
			unsent: false,
			reactions: [],
			replyToMessage: null,
		});
		await backToChats(page).click();
		await expect(sheet(page)).toHaveCount(0);

		const late = row(page, { href: `/chat/${QUIET_CONVERSATION_ID}` });
		await expect(late).toContainText(LATE_TEXT);
		await expect(late.locator('[data-slot="badge"]')).toHaveText("1");
		expect(
			await rows(page).nth(1).getAttribute("href"),
			"the row moved up to under the pinned one",
		).toBe(`/chat/${QUIET_CONVERSATION_ID}`);
	});
});

test("wide screens keep the list rendered beside an open conversation", async ({
	page,
}) => {
	await page.setViewportSize(WIDE);
	await openInbox(page);
	await rows(page).nth(1).click();
	await backToChats(page).waitFor();

	expect(await listIsRendered(page)).toBe(true);
});
