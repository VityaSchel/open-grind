import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	MESSAGE_ROW,
	pathname,
} from "./support/app";
import { BLUR_MODES, setBlurMode } from "./support/layout-guard";
import {
	DARK_SCRIM,
	edgeLineColumns,
	expectEdgeJustLeftOf,
	pauseMidSlide,
	pauseOnceSliding,
	resumeSlides,
	scrimStrength,
} from "./support/stack-layers";
import {
	cancelSystemBack,
	commitSystemBack,
	progressSystemBack,
	startSystemBack,
	startSystemBackMidSlide,
} from "./support/system-back";

const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1024, height: 800 };
const PARALLAX = 0.33;

const SHEET = '[data-slot="live-stack-sheet"]';
const base = (page: Page) => page.locator('[data-slot="live-stack-base"]');
const sheet = (page: Page) => page.locator(SHEET);
const dim = (page: Page) => page.locator('[data-slot="live-stack-dim"]');
const listScroller = (page: Page) =>
	page.locator('[data-slot="conversations-scroller"]');
const rows = (page: Page) => page.locator('a[href^="/chat/"]:visible');
const row = (page: Page, { href }: { href: string }) =>
	page.locator(`a[href="${href}"]:visible`);
const highlightedRows = (page: Page) =>
	base(page).locator('[data-slot="item"][data-variant="muted"]');
const backToChats = (page: Page) =>
	page.getByRole("link", { name: "Back to chats" });
const REPLIABLE = "consectetur adipiscing elit";
const messageRow = (page: Page) =>
	page.locator(MESSAGE_ROW).filter({ hasText: REPLIABLE });

const offsetX = (page: Page, slot: "base" | "sheet") =>
	page
		.locator(`[data-slot="live-stack-${slot}"]`)
		.evaluate((pane) =>
			Math.round(new DOMMatrix(getComputedStyle(pane).transform).m41),
		);

async function openInbox(page: Page, { platform = "macos" } = {}) {
	await installTauriShim(page, { platform });
	await page.goto("/chat");
	await rows(page).nth(1).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function openConversation(page: Page, { href }: { href?: string } = {}) {
	const target = href ?? (await rows(page).nth(1).getAttribute("href"));
	await row(page, { href: target! }).click();
	await expect(page).toHaveURL(new RegExp(`${target}$`));
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
	return target;
}

async function tapRow(page: Page, { href, x }: { href: string; x: number }) {
	const box = (await row(page, { href }).boundingBox())!;
	await row(page, { href }).click({
		position: { x: x - box.x, y: box.height / 2 },
	});
}

const historyPathnames = (page: Page) =>
	page.evaluate(() =>
		(window.navigation?.entries() ?? []).map(
			({ url }) => new URL(url ?? "").pathname,
		),
	);

type Frame = { base: number; sheet: number | null; path: string };

function recordFrames(page: Page): Promise<Frame[]> {
	return page.evaluate(
		() =>
			new Promise<Frame[]>((resolve) => {
				const frames: Frame[] = [];
				const x = (slot: string) => {
					const pane = document.querySelector(
						`[data-slot="live-stack-${slot}"]`,
					);
					return pane
						? new DOMMatrix(getComputedStyle(pane).transform).m41
						: null;
				};
				const started = performance.now();
				const sample = () => {
					frames.push({
						base: x("base") ?? 0,
						sheet: x("sheet"),
						path: location.pathname,
					});
					if (performance.now() - started < 2000)
						requestAnimationFrame(sample);
					else resolve(frames);
				};
				requestAnimationFrame(sample);
			}),
	);
}

test.describe("the chat stack on a phone", () => {
	test.use({ viewport: PHONE });

	test("a conversation slides in over the live list", async ({ page }) => {
		await openInbox(page, { platform: "android" });
		const recording = recordFrames(page);
		await openConversation(page);
		const frames = (await recording).filter(({ sheet }) => sheet !== null);

		const sheetX = frames.map(({ sheet }) => sheet ?? 0);
		expect(sheetX[0]).toBeGreaterThan(PHONE.width * 0.9);
		expect(sheetX.at(-1)).toBe(0);
		for (let i = 1; i < sheetX.length; i++)
			expect(sheetX[i]).toBeLessThanOrEqual(sheetX[i - 1]!);
		expect(frames.at(-1)?.base).toBeCloseTo(-PHONE.width * PARALLAX, 0);
	});

	test("the list stays mounted, hidden and inert under an open conversation", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		await listScroller(page).evaluate((scroller) => {
			(scroller as HTMLElement & { __kept?: boolean }).__kept = true;
		});
		await openConversation(page);

		await expect(base(page)).toHaveCSS("visibility", "hidden");
		await expect(base(page)).toHaveAttribute("inert", "");
		await expect(
			base(page).getByRole("link", {
				name: "Me",
				exact: true,
				includeHidden: true,
			}),
		).toHaveCount(1);
		expect(
			await listScroller(page).evaluate(
				(scroller) =>
					(scroller as HTMLElement & { __kept?: boolean }).__kept,
			),
		).toBe(true);
	});

	test("Back slides the conversation out and the list keeps its scroll position", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		await listScroller(page).evaluate((scroller) => {
			scroller.scrollTop = 120;
		});
		const listOffset = await listScroller(page).evaluate(
			(scroller) => scroller.scrollTop,
		);
		expect(listOffset).toBeGreaterThan(0);
		const visibleRow = await page.evaluate(() =>
			[
				...document.querySelectorAll<HTMLAnchorElement>(
					'a[href^="/chat/"]',
				),
			]
				.find((row) => {
					const { top, bottom, width } = row.getBoundingClientRect();
					return width > 0 && top > 120 && bottom < innerHeight - 120;
				})
				?.getAttribute("href"),
		);
		await openConversation(page, { href: visibleRow! });

		const recording = recordFrames(page);
		await backToChats(page).click();
		const leaving = (await recording).filter(
			({ path, sheet }) => path === "/chat" && sheet !== null,
		);

		expect(leaving.length).toBeGreaterThan(3);
		expect(leaving[0]?.sheet).toBeLessThan(PHONE.width * 0.5);
		expect(leaving.at(-1)?.sheet).toBeGreaterThan(PHONE.width * 0.9);
		await expect(sheet(page)).toHaveCount(0);
		await expect(base(page)).toHaveCSS("visibility", "visible");
		expect(
			await listScroller(page).evaluate((scroller) => scroller.scrollTop),
		).toBe(listOffset);
	});

	test("the system back gesture drags the conversation and commits back to the list", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		await openConversation(page);

		expect(await startSystemBack(page)).toBe(true);
		await progressSystemBack(page, 0.3);
		await expect(base(page)).toHaveCSS("visibility", "visible");
		expect(await offsetX(page, "sheet")).toBeCloseTo(PHONE.width * 0.3, -1);
		expect(await offsetX(page, "base")).toBeCloseTo(
			-PHONE.width * PARALLAX * 0.7,
			-1,
		);

		expect(await commitSystemBack(page)).toBe(false);
		await expect(page).toHaveURL(/\/chat$/);
		await expect(sheet(page)).toHaveCount(0);
		await expect(dim(page)).toHaveCount(0);
	});

	test("the system back gesture dims the list and edges the conversation sliding off it", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		await openConversation(page);

		expect(await startSystemBack(page)).toBe(true);
		await progressSystemBack(page, 0.25);
		const left = await sheet(page).evaluate(
			(pane) => pane.getBoundingClientRect().x,
		);

		expect(await scrimStrength(dim(page))).toBeCloseTo(
			DARK_SCRIM * 0.75,
			2,
		);
		await expectEdgeJustLeftOf(page, { x: left });
		await cancelSystemBack(page);
	});

	test("neither the list nor a conversation shows an edge at rest in any blur mode", async ({
		page,
	}) => {
		const leftColumn = { x: 0, y: 0, width: 2, height: PHONE.height };
		await openInbox(page, { platform: "android" });
		for (const mode of BLUR_MODES) {
			await setBlurMode(page, mode);
			expect(
				await edgeLineColumns(page, { clip: leftColumn }),
				`list, ${mode}`,
			).toEqual([]);
		}

		await openConversation(page);
		for (const mode of BLUR_MODES) {
			await setBlurMode(page, mode);
			expect(
				await edgeLineColumns(page, { clip: leftColumn }),
				`conversation, ${mode}`,
			).toEqual([]);
		}
	});

	test("a back gesture during the slide-in picks the conversation up where it is, lets the finger drive the rest and commits back to the list", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });

		const pickUp = startSystemBackMidSlide(page, SHEET);
		await rows(page).nth(1).click();
		const { started, before, pickedUp, aFrameLater } = await pickUp;

		expect(started).toBe(true);
		expect(pickedUp, "the sheet stays where it was").toBeCloseTo(
			before,
			-1,
		);
		expect(aFrameLater, "the sheet must not snap fully in").toBeGreaterThan(
			0,
		);
		expect(aFrameLater).toBeLessThanOrEqual(before);
		await expect(base(page)).toHaveCSS("visibility", "visible");

		await progressSystemBack(page, 0.5);
		expect(await offsetX(page, "sheet")).toBeGreaterThanOrEqual(
			PHONE.width / 2 - 1,
		);
		await expect
			.poll(() => offsetX(page, "sheet"))
			.toBeCloseTo(PHONE.width / 2, 0);

		expect(await commitSystemBack(page)).toBe(false);
		await expect(page).toHaveURL(/\/chat$/);
		await expect(sheet(page)).toHaveCount(0);
		await expect(dim(page)).toHaveCount(0);
	});

	test("canceling the system back gesture covers the list again", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		const href = await openConversation(page);

		await startSystemBack(page);
		await progressSystemBack(page, 0.4);
		await cancelSystemBack(page);

		await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
		await expect(page).toHaveURL(new RegExp(`${href}$`));
		await expect(base(page)).toHaveCSS("visibility", "hidden");
		expect(await offsetX(page, "sheet")).toBe(0);
	});

	test("Back pressed while a conversation slides out passes through and keeps its armed reply", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		await openConversation(page, { href: DEMO_CONVERSATION });
		await messageRow(page).click({ button: "right" });
		await page.getByRole("button", { name: "Reply" }).click();
		await expect(page.getByLabel("Cancel reply")).toBeVisible();

		await backToChats(page).click();
		await expect(page.locator("[data-leaving]")).toBeAttached();
		expect(
			await page.evaluate(() => window.__AndroidOnBackGesture?.()),
		).toBe(true);

		await expect(sheet(page)).toHaveCount(0);
		await openConversation(page, { href: DEMO_CONVERSATION });
		await expect(page.getByLabel("Cancel reply")).toBeVisible();
	});

	test("Back closes an open message menu instead of leaving the conversation", async ({
		page,
	}) => {
		await openInbox(page, { platform: "android" });
		const href = await openConversation(page);
		await page.locator(MESSAGE_ROW).first().click({ button: "right" });
		const reply = page.getByRole("button", { name: "Reply" });
		await expect(reply).toBeVisible();

		expect(await startSystemBack(page)).toBe(false);
		expect(await commitSystemBack(page)).toBe(false);

		await expect(reply).toBeHidden();
		await expect(page).toHaveURL(new RegExp(`${href}$`));
	});

	test("a conversation opened directly leaves the gesture to the platform, yet Back still slides over the list", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "android" });
		await page.goto(DEMO_CONVERSATION);
		await backToChats(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		expect(await startSystemBack(page)).toBe(false);

		const recording = recordFrames(page);
		await backToChats(page).click();
		const frames = (await recording).filter(({ sheet }) => sheet !== null);
		expect(frames.length).toBeGreaterThan(3);
		await expect(page).toHaveURL(/\/chat$/);
		await expect(rows(page).nth(1)).toBeVisible();
	});

	test("reduced motion swaps at once, yet the gesture still follows the finger with the list held still", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openInbox(page, { platform: "android" });
		const recording = recordFrames(page);
		await openConversation(page);
		const frames = (await recording).filter(({ sheet }) => sheet !== null);
		expect(frames.length).toBeGreaterThan(0);
		expect(frames.every(({ sheet }) => sheet === 0)).toBe(true);

		expect(await startSystemBack(page)).toBe(true);
		await progressSystemBack(page, 0.5);
		expect(await offsetX(page, "sheet")).toBeCloseTo(PHONE.width * 0.5, -1);
		expect(await offsetX(page, "base")).toBe(0);
		expect(await scrimStrength(dim(page))).toBeCloseTo(DARK_SCRIM * 0.5, 2);
		await cancelSystemBack(page);
	});
});

test.describe("the list behind a conversation that is sliding out on an Android phone", () => {
	test.use({ viewport: PHONE });

	async function openOneOfTwo(page: Page) {
		await openInbox(page, { platform: "android" });
		const other = await rows(page).nth(2).getAttribute("href");
		const opened = await openConversation(page);
		return { opened: opened!, other: other! };
	}

	async function pressBackAndHoldMidSlide(page: Page) {
		const paused = pauseMidSlide(page, { pane: SHEET });
		await backToChats(page).click();
		const edge = await paused;
		await expect(sheet(page)).toHaveAttribute("data-leaving");
		return edge;
	}

	test("another conversation opens while the last one is still sliding out", async ({
		page,
	}) => {
		const { other } = await openOneOfTwo(page);
		const edge = await pressBackAndHoldMidSlide(page);

		await tapRow(page, { href: other, x: edge / 2 });

		await expect(page).toHaveURL(new RegExp(`${other}$`));
		expect(await historyPathnames(page)).toEqual(["/chat", other]);
		await resumeSlides(page);
		await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
		await expect(sheet(page)).toHaveCount(1);
		expect(await offsetX(page, "sheet")).toBe(0);
		await expect(base(page)).toHaveAttribute("inert");
	});

	test("a released back gesture frees the list and clears the row highlight before the conversation has slid out", async ({
		page,
	}) => {
		const { other } = await openOneOfTwo(page);

		expect(await startSystemBack(page)).toBe(true);
		await progressSystemBack(page, 0.4);
		await expect(base(page)).toHaveAttribute("inert");
		await expect(highlightedRows(page)).toHaveCount(1);

		const held = pauseOnceSliding(page, { pane: SHEET });
		expect(await commitSystemBack(page)).toBe(false);
		const edge = await held;

		await expect(base(page)).not.toHaveAttribute("inert");
		await expect(highlightedRows(page)).toHaveCount(0);
		expect(await pathname(page)).toBe("/chat");
		expect(await sheet(page).getAttribute("data-leaving")).not.toBeNull();
		expect(await offsetX(page, "sheet")).toBeLessThan(PHONE.width);

		await tapRow(page, { href: other, x: edge / 2 });
		await expect(page).toHaveURL(new RegExp(`${other}$`));
		expect(await historyPathnames(page)).toEqual(["/chat", other]);
	});

	test("a back swipe started while the last one is still sliding out is left to the system and does not cut that slide", async ({
		page,
	}) => {
		await openOneOfTwo(page);
		await startSystemBack(page);
		await progressSystemBack(page, 0.4);
		const held = pauseOnceSliding(page, { pane: SHEET });
		expect(await commitSystemBack(page)).toBe(false);
		const edge = await held;

		expect(
			await startSystemBack(page),
			"the system owns the second swipe",
		).toBe(false);
		await afterTwoFrames(page);
		expect(await offsetX(page, "sheet")).toBeCloseTo(edge, -1);
		expect(await pathname(page)).toBe("/chat");

		await resumeSlides(page);
		await expect(sheet(page)).toHaveCount(0);
		expect(await pathname(page)).toBe("/chat");
	});

	test("a tap on the part the leaving conversation still covers does not reach the list", async ({
		page,
	}) => {
		const { other } = await openOneOfTwo(page);
		const edge = await pressBackAndHoldMidSlide(page);
		const box = (await row(page, { href: other }).boundingBox())!;
		const covered = {
			x: (edge + PHONE.width) / 2,
			y: box.y + box.height / 2,
		};

		const stacked = await page.evaluate(({ x, y }) => {
			const [top, ...under] = document.elementsFromPoint(x, y);
			return {
				top: top?.getAttribute("data-slot"),
				rowUnderneath: under.some((element) =>
					element.closest('a[href^="/chat/"]'),
				),
			};
		}, covered);
		expect(stacked).toEqual({
			top: "live-stack-sheet",
			rowUnderneath: true,
		});

		await page.mouse.click(covered.x, covered.y);
		await afterTwoFrames(page);

		expect(await pathname(page)).toBe("/chat");
		await resumeSlides(page);
		await expect(sheet(page)).toHaveCount(0);
		expect(await pathname(page)).toBe("/chat");
	});

	test("a second tap on Back lands on the filter bar the conversation uncovers and switches no filter on", async ({
		page,
	}) => {
		await openOneOfTwo(page);
		const arrow = (await backToChats(page).boundingBox())!;
		const edge = await pressBackAndHoldMidSlide(page);
		const secondTap = {
			x: arrow.x + arrow.width / 2,
			y: arrow.y + arrow.height / 2,
		};
		expect(secondTap.x, "the arrow's spot is uncovered").toBeLessThan(edge);

		await page.mouse.click(secondTap.x, secondTap.y);
		await resumeSlides(page);
		await expect(sheet(page)).toHaveCount(0);

		expect(await pathname(page)).toBe("/chat");
		for (const name of ["Favorites only", "Unread"])
			await expect(
				page.getByRole("button", { name, exact: true }),
			).toHaveAttribute("aria-pressed", "false");
	});

	test("tapping the same conversation mid-slide brings it back live without remounting it", async ({
		page,
	}) => {
		const { opened } = await openOneOfTwo(page);
		await sheet(page).evaluate((pane) => {
			(pane as HTMLElement & { __kept?: boolean }).__kept = true;
		});
		const edge = await pressBackAndHoldMidSlide(page);

		const slidingBackIn = pauseOnceSliding(page, { pane: SHEET });
		await tapRow(page, { href: opened, x: edge / 2 });
		await slidingBackIn;

		await expect(page).toHaveURL(new RegExp(`${opened}$`));
		await expect(sheet(page)).not.toHaveAttribute("data-leaving");
		await expect(page.getByRole("textbox")).toBeEnabled();
		expect(
			await offsetX(page, "sheet"),
			"still on its way in",
		).toBeGreaterThan(0);
		expect(
			await sheet(page).evaluate(
				(pane) => (pane as HTMLElement & { __kept?: boolean }).__kept,
			),
		).toBe(true);

		await resumeSlides(page);
		await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
		expect(await offsetX(page, "sheet")).toBe(0);
	});
});

test("wide screens show the list beside the conversation with no stack", async ({
	page,
}) => {
	await page.setViewportSize(WIDE);
	await openInbox(page);
	await rows(page).nth(1).click();
	await backToChats(page).waitFor();

	await expect(base(page)).toHaveCount(0);
	await expect(sheet(page)).toHaveCount(0);
	await expect(listScroller(page)).toBeVisible();
});
