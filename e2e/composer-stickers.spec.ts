import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	installTauriShim,
	TrustedTouch,
	wheel,
} from "./support/app";
import {
	box,
	DRAWER,
	expandToFull,
	openComposerSheet,
	snapTops,
} from "./support/drawer";

const STICKER_TILE = '[data-slot="sticker-tile"]';
const SELECTED_STICKER_TILE = `${STICKER_TILE}[aria-pressed="true"]`;

function openStickers(page: Page) {
	return openComposerSheet(page, { trigger: "GIFs and stickers" });
}

function sendButton(page: Page) {
	return page.locator(DRAWER).getByRole("button", { name: /^Send / });
}

test.describe("composer stickers sheet", () => {
	test("opens at the short size with the content pinned and unscrollable", async ({
		page,
	}) => {
		await openStickers(page);
		const { short } = await snapTops(page);
		const b = await box(page);
		expect(Math.abs(b.top - short), "opens at the short snap").toBeLessThan(
			8,
		);
		expect(b.gridScrollTop, "content starts at its top").toBe(0);
	});

	test("the footer sits at the visible bottom edge", async ({ page }) => {
		await openStickers(page);
		const b = await box(page);
		const bottomEdge = b.viewport - b.safeBottom;
		expect(b.tabListBottom).toBeLessThanOrEqual(bottomEdge + 2);
		expect(bottomEdge - b.tabListBottom).toBeLessThan(48);
	});

	test("a wheel drags the sheet continuously instead of snapping", async ({
		page,
	}) => {
		await openStickers(page);
		const start = await box(page);
		const at = { x: 210, y: start.top + 160 };
		const tops: number[] = [];
		for (let i = 0; i < 5; i++) {
			await wheel(page, at, 60);
			tops.push((await box(page)).top);
		}
		const { full, short } = await snapTops(page);
		expect(
			tops.filter((t) => t > full + 4 && t < short - 4).length,
			`expected intermediate positions, saw ${tops.join()}`,
		).toBeGreaterThan(0);
	});

	test("touch: one unbroken drag resizes, then scrolls the content", async ({
		page,
	}) => {
		await openStickers(page);
		const touch = await TrustedTouch.attach(page);
		const start = await box(page);
		await touch.drag(
			page,
			{ x: 210, y: start.top + 300 },
			{ x: 210, y: 60 },
			{ steps: 30, holdMs: 16 },
		);
		await page.waitForTimeout(600);
		const { full } = await snapTops(page);
		const b = await box(page);
		expect(b.top, "sheet reached full size").toBeLessThanOrEqual(full + 6);
		expect(
			b.gridScrollTop,
			"the drag carried on into the content",
		).toBeGreaterThan(0);
	});

	test("touch: dragging the content down from full size collapses it", async ({
		page,
	}) => {
		await openStickers(page);
		await expandToFull(page);
		const touch = await TrustedTouch.attach(page);
		expect((await box(page)).gridScrollTop).toBe(0);
		await touch.drag(page, { x: 210, y: 240 }, { x: 210, y: 640 });
		const { full } = await snapTops(page);
		await expect
			.poll(async () => (await box(page)).top - full, { timeout: 5000 })
			.toBeGreaterThan(20);
	});

	test("touch: while the content is scrolled, dragging does not collapse it", async ({
		page,
	}) => {
		await openStickers(page);
		await expandToFull(page);
		const touch = await TrustedTouch.attach(page);
		await touch.drag(page, { x: 210, y: 520 }, { x: 210, y: 220 });
		await page.waitForTimeout(500);
		expect((await box(page)).gridScrollTop).toBeGreaterThan(0);
		await touch.drag(page, { x: 210, y: 300 }, { x: 210, y: 560 });
		await page.waitForTimeout(600);
		const { full } = await snapTops(page);
		expect((await box(page)).top - full).toBeLessThanOrEqual(4);
	});

	test("a drag does not select the tile under the finger; a tap does", async ({
		page,
	}) => {
		await openStickers(page);
		const touch = await TrustedTouch.attach(page);
		const tile = page.locator(STICKER_TILE).first();
		const rect = (await tile.boundingBox())!;
		const centre = {
			x: rect.x + rect.width / 2,
			y: rect.y + rect.height / 2,
		};
		await touch.drag(page, centre, { x: centre.x, y: centre.y - 120 });
		await page.waitForTimeout(1000);
		await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(0);

		const still = (await page.locator(STICKER_TILE).first().boundingBox())!;
		await touch.start(
			still.x + still.width / 2,
			still.y + still.height / 2,
		);
		await page.waitForTimeout(60);
		await touch.end();
		await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(1);
	});

	test("only one tile is selected at a time, and Send shows no count", async ({
		page,
	}) => {
		await openStickers(page);
		const first = page.getByRole("button", { name: "GIF 1", exact: true });
		const second = page.getByRole("button", { name: "GIF 2", exact: true });

		await first.click();
		await expect(first).toHaveAttribute("aria-pressed", "true");
		await expect(sendButton(page)).toHaveText("Send GIF");

		await second.click();
		await expect(second).toHaveAttribute("aria-pressed", "true");
		await expect(first).toHaveAttribute("aria-pressed", "false");
		await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(1);

		await second.click();
		await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(0);
		await expect(sendButton(page)).toHaveCount(0);
	});

	test("the tabs switch between a two-column GIF grid and a four-column Gaymoji grid", async ({
		page,
	}) => {
		await openStickers(page);
		const columns = () =>
			page.evaluate((tile) => {
				const visible = [
					...document.querySelectorAll<HTMLElement>(tile),
				].filter((el) => el.offsetParent !== null);
				const top = visible[0]?.getBoundingClientRect().top;
				return visible.filter(
					(el) => el.getBoundingClientRect().top === top,
				).length;
			}, STICKER_TILE);

		expect(await columns()).toBe(2);
		await page.getByRole("tab", { name: "Gaymoji" }).click();
		await expect(
			page.getByRole("button", { name: "Gaymoji 1", exact: true }),
		).toBeVisible();
		expect(await columns()).toBe(4);
		await page.getByRole("tab", { name: "GIFs" }).click();
		expect(await columns()).toBe(2);
	});
});

test.describe("composer geometry", () => {
	test("the one-line composer is 44px tall and every button spans it", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto(DEMO_CONVERSATION);
		const textarea = page.locator(
			'[data-slot="message-composer"] textarea',
		);
		await textarea.waitFor({ timeout: 30_000 });
		await page.waitForTimeout(600);

		const heights = async () =>
			page.evaluate(() => {
				const composer = document.querySelector(
					'[data-slot="message-composer"]',
				)!;
				const field = composer.querySelector("textarea")!;
				const fieldRect = field.getBoundingClientRect();
				return {
					field: fieldRect.height,
					buttons: [...composer.querySelectorAll("button")].map(
						(button) => {
							const rect = button.getBoundingClientRect();
							return {
								name: button.getAttribute("aria-label"),
								height: rect.height,
								bottomGap: fieldRect.bottom - rect.bottom,
							};
						},
					),
				};
			});

		const empty = await heights();
		expect(empty.field).toBeCloseTo(44, 0);
		expect(empty.buttons.map((b) => b.name)).toEqual([
			"GIFs and stickers",
			"Add attachment",
			"Record voice message",
		]);
		for (const button of empty.buttons) {
			expect(button.height, button.name ?? "").toBeCloseTo(44, 0);
			expect(Math.abs(button.bottomGap), button.name ?? "").toBeLessThan(
				1,
			);
		}

		await textarea.fill("hello");
		await expect(
			page.getByRole("button", { name: "GIFs and stickers" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Add attachment" }),
		).toHaveCount(0);
		await expect(
			page.getByRole("button", { name: "Record voice message" }),
		).toHaveCount(0);
		const typing = await heights();
		expect(typing.field).toBeCloseTo(44, 0);
		expect(typing.buttons.map((b) => b.name)).toEqual([
			"GIFs and stickers",
			"Send message",
		]);
	});
});
