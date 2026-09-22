import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	pathname,
} from "./support/app";
import {
	cancelSystemBack,
	commitSystemBack,
	progressSystemBack,
	startSystemBack,
} from "./support/system-back";

const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1024, height: 800 };
const PARALLAX = 0.33;

const base = (page: Page) => page.locator('[data-slot="live-stack-base"]');
const sheet = (page: Page) => page.locator('[data-slot="live-stack-sheet"]');
const dim = (page: Page) => page.locator('[data-slot="live-stack-dim"]');
const listScroller = (page: Page) =>
	page.locator('[data-slot="conversations-scroller"]');
const rows = (page: Page) => page.locator('a[href^="/chat/"]:visible');
const backToChats = (page: Page) =>
	page.getByRole("link", { name: "Back to chats" });
const REPLIABLE = "consectetur adipiscing elit";
const messageRow = (page: Page) =>
	page
		.locator('[role="button"][tabindex="0"]')
		.filter({ hasText: REPLIABLE });

const offsetX = (page: Page, slot: "base" | "sheet") =>
	page
		.locator(`[data-slot="live-stack-${slot}"]`)
		.evaluate((pane) =>
			Math.round(new DOMMatrix(getComputedStyle(pane).transform).m41),
		);

async function openInbox(page: Page) {
	await installTauriShim(page);
	await page.goto("/chat");
	await rows(page).nth(1).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
}

async function openConversation(page: Page, { href }: { href?: string } = {}) {
	const target = href ?? (await rows(page).nth(1).getAttribute("href"));
	await page.locator(`a[href="${target}"]:visible`).click();
	await expect(page).toHaveURL(new RegExp(`${target}$`));
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
	return target;
}

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
		await openInbox(page);
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
		await openInbox(page);
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
		await openInbox(page);
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
		await openInbox(page);
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

	test("a back swipe started while the last one is still sliding out finishes that one first", async ({
		page,
	}) => {
		await openInbox(page);
		await openConversation(page);

		await startSystemBack(page);
		await progressSystemBack(page, 0.4);
		expect(await commitSystemBack(page)).toBe(false);

		expect(
			await startSystemBack(page),
			"the system owns the second swipe",
		).toBe(false);
		await afterTwoFrames(page);
		expect(await pathname(page)).toBe("/chat");
		await expect(sheet(page)).toHaveCount(0);
	});

	test("canceling the system back gesture covers the list again", async ({
		page,
	}) => {
		await openInbox(page);
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
		await openInbox(page);
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
		await openInbox(page);
		const href = await openConversation(page);
		await page
			.locator('[role="button"][tabindex="0"]')
			.first()
			.click({ button: "right" });
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
		await installTauriShim(page);
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
		await openInbox(page);
		const recording = recordFrames(page);
		await openConversation(page);
		const frames = (await recording).filter(({ sheet }) => sheet !== null);
		expect(frames.length).toBeGreaterThan(0);
		expect(frames.every(({ sheet }) => sheet === 0)).toBe(true);

		expect(await startSystemBack(page)).toBe(true);
		await progressSystemBack(page, 0.5);
		expect(await offsetX(page, "sheet")).toBeCloseTo(PHONE.width * 0.5, -1);
		expect(await offsetX(page, "base")).toBe(0);
		await cancelSystemBack(page);
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
