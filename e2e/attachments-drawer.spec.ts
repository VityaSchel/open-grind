import { expect, test } from "@playwright/test";

import { TrustedTouch, wheel } from "./support/app";
import {
	box,
	DRAWER,
	expandToFull,
	LIFTED_MEDIA_TILE,
	MEDIA_TILE,
	openAttachments,
	SELECTABLE_MEDIA_TILE,
	SELECTED_MEDIA_TILE,
	snapTops,
} from "./support/drawer";

const MESSAGE = '[role="article"]';

test.describe("attachments drawer", () => {
	test("opens at the short size with the content pinned and unscrollable", async ({
		page,
	}) => {
		await openAttachments(page);
		const { short } = await snapTops(page);
		const b = await box(page);

		expect(Math.abs(b.top - short), "opens at the short snap").toBeLessThan(
			8,
		);
		expect(b.gridScrollTop, "content starts at its top").toBe(0);
	});

	test("the footer sits at the visible bottom edge, not below it", async ({
		page,
	}) => {
		await openAttachments(page);
		const b = await box(page);
		const bottomEdge = b.viewport - b.safeBottom;
		expect(
			b.tabListBottom,
			"the tab bar is inside the visible area, not under the inset",
		).toBeLessThanOrEqual(bottomEdge + 2);
		expect(
			bottomEdge - b.tabListBottom,
			"and it sits at that bottom edge rather than far above it",
		).toBeLessThan(48);
	});

	test("a wheel drags the drawer continuously instead of snapping", async ({
		page,
	}) => {
		await openAttachments(page);
		const start = await box(page);
		const at = { x: 210, y: start.top + 160 };
		const tops: number[] = [];
		for (let i = 0; i < 5; i++) {
			await wheel(page, at, 60);
			tops.push((await box(page)).top);
		}
		const { full, short } = await snapTops(page);
		const intermediate = tops.filter((t) => t > full + 4 && t < short - 4);
		expect(
			intermediate.length,
			`expected the drawer to pass through intermediate positions, saw ${tops.join()}`,
		).toBeGreaterThan(0);
		expect(tops.at(-1)).toBeLessThan(tops[0] ?? 0);
	});

	test("released part way, it settles onto the nearest snap", async ({
		page,
	}) => {
		await openAttachments(page);
		const start = await box(page);
		await wheel(page, { x: 210, y: start.top + 160 }, 60, { steps: 2 });
		const { full, short } = await snapTops(page);
		await page.waitForTimeout(900);
		const settled = await box(page);
		expect(
			[full, short].some((t) => Math.abs(settled.top - t) < 8),
			`settled at ${settled.top}, expected one of ${full} / ${short}`,
		).toBe(true);
	});

	test("one unbroken wheel gesture resizes, then scrolls the content", async ({
		page,
	}) => {
		await openAttachments(page);
		const start = await box(page);
		const at = { x: 210, y: start.top + 160 };
		await page.mouse.move(at.x, at.y);
		for (let i = 0; i < 26; i++) {
			await page.mouse.wheel(0, 70);
			await page.waitForTimeout(16);
		}
		const { full } = await snapTops(page);
		const b = await box(page);
		expect(b.top, "drawer reached full size").toBeLessThanOrEqual(full + 4);
		expect(
			b.gridScrollTop,
			"the same gesture carried on into the content without a pause",
		).toBeGreaterThan(0);
	});

	test("one unbroken wheel gesture scrolls to the top, then collapses", async ({
		page,
	}) => {
		await openAttachments(page);
		await expandToFull(page);
		const at = { x: 210, y: 300 };
		await page.mouse.move(at.x, at.y);
		for (let i = 0; i < 14; i++) {
			await page.mouse.wheel(0, 90);
			await page.waitForTimeout(16);
		}
		await page.waitForTimeout(400);
		expect((await box(page)).gridScrollTop).toBeGreaterThan(0);

		await page.mouse.move(at.x, at.y);
		for (let i = 0; i < 40; i++) {
			await page.mouse.wheel(0, -90);
			await page.waitForTimeout(16);
		}
		const { full } = await snapTops(page);
		const b = await box(page);
		expect(b.gridScrollTop, "content is back at its top").toBe(0);
		expect(
			b.top - full,
			"the drawer kept shrinking in the same gesture",
		).toBeGreaterThan(20);
	});

	test("touch: dragging the content down from full size collapses it", async ({
		page,
	}) => {
		await openAttachments(page);
		await expandToFull(page);
		const touch = await TrustedTouch.attach(page);
		const before = await box(page);
		expect(before.gridScrollTop, "starts at the content's top").toBe(0);

		await touch.drag(page, { x: 210, y: 240 }, { x: 210, y: 640 });

		const { full } = await snapTops(page);
		await expect
			.poll(async () => (await box(page)).top - full, { timeout: 5000 })
			.toBeGreaterThan(20);
	});

	test("touch: while the content is scrolled, dragging does not collapse it", async ({
		page,
	}) => {
		await openAttachments(page);
		await expandToFull(page);
		const touch = await TrustedTouch.attach(page);
		await touch.drag(page, { x: 210, y: 520 }, { x: 210, y: 220 });
		await page.waitForTimeout(500);
		const scrolled = await box(page);
		expect(
			scrolled.gridScrollTop,
			"content actually scrolled",
		).toBeGreaterThan(0);

		await touch.drag(page, { x: 210, y: 300 }, { x: 210, y: 560 });
		await page.waitForTimeout(600);
		const { full } = await snapTops(page);
		const after = await box(page);
		expect(
			after.top - full,
			"the drawer stayed put while the content had scroll to give",
		).toBeLessThanOrEqual(4);
	});

	test("touch: one unbroken drag resizes, then scrolls the content", async ({
		page,
	}) => {
		await openAttachments(page);
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
		expect(b.top, "drawer reached full size").toBeLessThanOrEqual(full + 6);
		expect(
			b.gridScrollTop,
			"the same drag carried on into the content",
		).toBeGreaterThan(0);
	});

	test("touch: one unbroken drag scrolls to the top, then collapses", async ({
		page,
	}) => {
		await openAttachments(page);
		await expandToFull(page);
		const touch = await TrustedTouch.attach(page);
		await touch.drag(page, { x: 210, y: 520 }, { x: 210, y: 240 });
		await page.waitForTimeout(400);
		expect((await box(page)).gridScrollTop).toBeGreaterThan(0);

		await touch.drag(
			page,
			{ x: 210, y: 200 },
			{ x: 210, y: 760 },
			{ steps: 40, holdMs: 16 },
		);
		await page.waitForTimeout(700);
		const { full } = await snapTops(page);
		const b = await box(page);
		expect(b.gridScrollTop, "content returned to its top").toBe(0);
		expect(
			b.top - full,
			"the drawer kept going into a collapse in the same drag",
		).toBeGreaterThan(20);
	});

	test("the handle drags the drawer to any size", async ({ page }) => {
		await openAttachments(page);
		const touch = await TrustedTouch.attach(page);
		const start = await box(page);
		await touch.drag(
			page,
			{ x: 210, y: start.top + 12 },
			{ x: 210, y: start.top - 150 },
			{ steps: 20 },
		);
		await page.waitForTimeout(900);
		expect((await box(page)).top).toBeLessThan(start.top - 40);
	});

	test("the footer stays at the bottom edge while the sheet moves", async ({
		page,
	}) => {
		await openAttachments(page);
		const at = { x: 210, y: (await box(page)).top + 160 };
		await page.mouse.move(at.x, at.y);
		const worst = await page.evaluate(async () => {
			const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
			const drawer = document.querySelector(
				"[data-vaul-drawer]",
			) as HTMLElement;
			const tabList = drawer.querySelector(
				"[data-slot=tabs-list]",
			) as HTMLElement;
			let drift = 0;
			for (let i = 0; i < 14; i++) {
				await sleep(40);
				const edge =
					window.innerHeight -
					(parseFloat(getComputedStyle(drawer).marginBottom) || 0);
				drift = Math.max(
					drift,
					Math.abs(edge - tabList.getBoundingClientRect().bottom),
				);
			}
			return Math.round(drift);
		});
		expect(
			worst,
			"the tab bar never drifts from the bottom edge",
		).toBeLessThan(40);
	});

	test("a drag does not select the item under the pointer; a tap does", async ({
		page,
	}) => {
		await openAttachments(page);
		const touch = await TrustedTouch.attach(page);
		const tile = page.locator(SELECTABLE_MEDIA_TILE).first();
		const rect = (await tile.boundingBox())!;
		const centre = {
			x: rect.x + rect.width / 2,
			y: rect.y + rect.height / 2,
		};

		await touch.drag(page, centre, { x: centre.x, y: centre.y - 120 });
		await page.waitForTimeout(1000);
		expect(
			await page.locator(SELECTED_MEDIA_TILE).count(),
			"a drag must not select",
		).toBe(0);

		const stillTile = page.locator(SELECTABLE_MEDIA_TILE).first();
		const r2 = (await stillTile.boundingBox())!;
		await touch.start(r2.x + r2.width / 2, r2.y + r2.height / 2);
		await page.waitForTimeout(60);
		await touch.end();
		await page.waitForTimeout(400);
		expect(
			await page.locator(SELECTED_MEDIA_TILE).count(),
			"a still tap must select",
		).toBe(1);
	});

	test("the expiring toggle sends the selection as an expiring photo", async ({
		page,
	}) => {
		await openAttachments(page);
		await page.locator(MESSAGE).first().waitFor({ timeout: 30_000 });
		const bubbles = page
			.locator("button")
			.filter({ hasText: "Expiring image" });
		const before = await bubbles.count();

		await page.locator(SELECTABLE_MEDIA_TILE).first().click();
		const toggle = page
			.locator(DRAWER)
			.getByRole("button", {
				name: "Set photo as expiring after 10 seconds",
			});
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-pressed", "true");

		await page
			.locator(DRAWER)
			.getByRole("button", { name: /^Send \d+$/ })
			.click();
		await expect(page.locator(DRAWER)).toHaveCount(0);
		await expect(bubbles).toHaveCount(before + 1);
	});

	test("the expiring toggle and the selection reset when the drawer reopens", async ({
		page,
	}) => {
		await openAttachments(page);
		await page.locator(SELECTABLE_MEDIA_TILE).first().click();
		const send = page
			.locator(DRAWER)
			.getByRole("button", { name: /^Send \d+$/ });
		await expect(send).toHaveCount(1);
		await page
			.locator(DRAWER)
			.getByRole("button", {
				name: "Set photo as expiring after 10 seconds",
			})
			.click();

		await page.keyboard.press("Escape");
		await expect(page.locator(DRAWER)).toHaveCount(0);
		await page.getByRole("button", { name: "Add attachment" }).click();
		await page.locator(DRAWER).waitFor({ timeout: 10_000 });
		await page.waitForTimeout(900);

		await expect(send).toHaveCount(0);
		await expect(page.locator(SELECTED_MEDIA_TILE)).toHaveCount(0);
	});

	test("closes by dragging well past the short size", async ({ page }) => {
		await openAttachments(page);
		const touch = await TrustedTouch.attach(page);
		const start = await box(page);
		await touch.drag(
			page,
			{ x: 210, y: start.top + 12 },
			{ x: 210, y: start.top + 420 },
			{ steps: 24 },
		);
		await page.waitForTimeout(900);
		await expect(page.locator(DRAWER)).toHaveCount(0);
	});

	test("dragging a tile down to close does not also select it", async ({
		page,
	}) => {
		await openAttachments(page);
		const touch = await TrustedTouch.attach(page);
		const tile = page.locator(SELECTABLE_MEDIA_TILE).first();
		const rect = (await tile.boundingBox())!;
		await touch.drag(
			page,
			{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
			{ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 + 420 },
			{ steps: 24 },
		);
		await page.waitForTimeout(900);
		await expect(page.locator(DRAWER)).toHaveCount(0);
		expect(
			await page.locator(SELECTED_MEDIA_TILE).count(),
			"closing by dragging a tile must not select it",
		).toBe(0);
	});

	test("right-click deletes a tile for good after confirming, and the drawer stays open", async ({
		page,
	}) => {
		await openAttachments(page);
		const tiles = page.locator(MEDIA_TILE);
		const before = await tiles.count();
		const firstId = await page.evaluate(
			(selector) => document.querySelector(selector)?.outerHTML,
			MEDIA_TILE,
		);

		await tiles.first().click({ button: "right" });
		await page
			.getByRole("menuitem", { name: "Delete permanently" })
			.click();
		const confirm = page.getByRole("alertdialog");
		await expect(confirm).toContainText("Delete this photo?");
		await confirm.getByRole("button", { name: "Delete" }).click();

		await expect(tiles).toHaveCount(before - 1);
		expect(
			await page.evaluate(
				(selector) => document.querySelector(selector)?.outerHTML,
				MEDIA_TILE,
			),
		).not.toBe(firstId);
		await expect(page.locator(DRAWER)).toBeVisible();
		expect(await page.locator(SELECTED_MEDIA_TILE).count()).toBe(0);
	});

	test("touch: a long press opens the delete menu without selecting the tile", async ({
		page,
	}) => {
		await openAttachments(page);
		const touch = await TrustedTouch.attach(page);
		const rect = (await page
			.locator(SELECTABLE_MEDIA_TILE)
			.first()
			.boundingBox())!;

		await touch.start(rect.x + rect.width / 2, rect.y + rect.height / 2);
		await page.waitForTimeout(900);
		await expect(
			page.getByRole("menuitem", { name: "Delete permanently" }),
		).toBeVisible();
		await touch.end();
		await page.waitForTimeout(300);

		await expect(
			page.getByRole("menuitem", { name: "Delete permanently" }),
			"lifting the finger that opened the menu keeps it open",
		).toBeVisible();
		await page.waitForTimeout(400);
		expect(await page.locator(SELECTED_MEDIA_TILE).count()).toBe(0);

		await page.keyboard.press("Escape");
		await expect(
			page.getByRole("menuitem", { name: "Delete permanently" }),
		).toBeHidden();
		await expect(page.locator(DRAWER)).toBeVisible();
	});

	test("tiles sit in rows with nothing between them but the grid gap", async ({
		page,
	}) => {
		await openAttachments(page);
		const rows = await page.evaluate((selector) => {
			const tiles = [
				...document.querySelectorAll<HTMLElement>(selector),
			].map((tile) => tile.getBoundingClientRect());
			const top = tiles[0]!.top;
			const nextRow = tiles.find((tile) => tile.top > top + 1)!;
			return { height: tiles[0]!.height, pitch: nextRow.top - top };
		}, MEDIA_TILE);

		expect(rows.pitch - rows.height).toBeLessThanOrEqual(3);
	});

	test("the menu lifts the tile over a blurred scrim, with the menu beside it", async ({
		page,
	}) => {
		await openAttachments(page);
		const tile = page.locator(MEDIA_TILE).nth(1);
		const tileBox = (await tile.boundingBox())!;

		await tile.click({ button: "right" });

		const lifted = page.locator(LIFTED_MEDIA_TILE);
		const menu = page.getByRole("menu", { name: /options$/ });
		await expect(menu).toBeVisible();
		const liftedBox = (await lifted.boundingBox())!;
		const menuBox = (await menu.boundingBox())!;
		expect(Math.abs(liftedBox.x - tileBox.x)).toBeLessThan(2);
		expect(Math.abs(liftedBox.y - tileBox.y)).toBeLessThan(2);
		const gapRight = menuBox.x - (liftedBox.x + liftedBox.width);
		const gapLeft = liftedBox.x - (menuBox.x + menuBox.width);
		expect(
			[gapRight, gapLeft].some((gap) => gap >= 4 && gap <= 16),
			"the menu sits right beside the tile",
		).toBe(true);
		expect(Math.abs(menuBox.y - liftedBox.y)).toBeLessThan(12);
		expect(
			await lifted.evaluate((copy) => {
				const image = copy.querySelector("img");
				const frame = copy.querySelector("canvas");
				return (
					(image !== null && image.currentSrc !== "") ||
					(frame !== null && frame.width > 0)
				);
			}),
			"the lifted copy shows the tile's media",
		).toBe(true);
		expect(
			await page.evaluate(
				() =>
					getComputedStyle(
						document.querySelector("dialog.menu-scrim")!,
						"::backdrop",
					).backdropFilter,
			),
		).toContain("blur");
		await expect(tile).toHaveCSS("opacity", "0");
	});

	test("tapping the scrim closes the menu only, selecting nothing under it", async ({
		page,
	}) => {
		await openAttachments(page);
		await page.locator(SELECTABLE_MEDIA_TILE).first().click();
		await expect(page.locator(SELECTED_MEDIA_TILE)).toHaveCount(1);
		const neighbor = page.locator(SELECTABLE_MEDIA_TILE).nth(2);
		const neighborBox = (await neighbor.boundingBox())!;

		await page
			.locator(SELECTABLE_MEDIA_TILE)
			.nth(1)
			.click({ button: "right" });
		await expect(page.getByRole("menu")).toBeVisible();
		await page.mouse.click(
			neighborBox.x + neighborBox.width / 2,
			neighborBox.y + neighborBox.height / 2,
		);
		await expect(page.getByRole("menu")).toHaveCount(0);
		await page.waitForTimeout(300);
		await expect(page.locator(SELECTED_MEDIA_TILE)).toHaveCount(1);

		await page
			.locator(SELECTABLE_MEDIA_TILE)
			.nth(1)
			.click({ button: "right" });
		await expect(page.getByRole("menu")).toBeVisible();
		await page.mouse.click(210, 20);
		await expect(page.getByRole("menu")).toHaveCount(0);
		await page.waitForTimeout(400);
		await expect(page.locator(DRAWER)).toBeVisible();
		await expect(page.locator(SELECTED_MEDIA_TILE)).toHaveCount(1);
	});

	test("Escape and a right-click on the scrim close the menu, not the sheet, and keep the scroll", async ({
		page,
	}) => {
		await openAttachments(page);
		await expandToFull(page);
		const scroller = page.locator("[data-slot=sheet-scroller]");
		await scroller.evaluate((el) => (el.scrollTop += 120));
		const scrolled = await scroller.evaluate((el) => el.scrollTop);
		const tile = page.locator(MEDIA_TILE).nth(4);

		await tile.click({ button: "right" });
		await expect(page.getByRole("menu")).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(page.getByRole("menu")).toHaveCount(0);
		await expect(page.locator(DRAWER)).toBeVisible();
		expect(await scroller.evaluate((el) => el.scrollTop)).toBe(scrolled);

		await tile.click({ button: "right" });
		await expect(page.getByRole("menu")).toBeVisible();
		const other = (await page.locator(MEDIA_TILE).nth(5).boundingBox())!;
		await page.mouse.click(
			other.x + other.width / 2,
			other.y + other.height / 2,
			{ button: "right" },
		);
		await page.waitForTimeout(400);
		await expect(
			page.locator("dialog[open]"),
			"the right-click closes the menu and opens no other",
		).toHaveCount(0);
		await expect(page.locator(DRAWER)).toHaveAttribute(
			"data-state",
			"open",
		);
		expect(
			await page
				.locator(MEDIA_TILE)
				.evaluateAll(
					(tiles) =>
						tiles.filter((t) => getComputedStyle(t).opacity === "0")
							.length,
				),
		).toBe(0);
		expect(await scroller.evaluate((el) => el.scrollTop)).toBe(scrolled);
	});

	test("the sheet scroller has scroll to give but paints no scrollbar", async ({
		page,
	}) => {
		await openAttachments(page);
		await expandToFull(page);
		const scroller = await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>(
				"[data-slot=sheet-scroller]",
			)!;
			const panel = document.querySelector<HTMLElement>(
				"[data-slot=sheet-panel]",
			)!;
			panel.style.minHeight = "";
			const style = getComputedStyle(el);
			return {
				overflowY: style.overflowY,
				scrollbarWidth: style.scrollbarWidth,
				range: el.scrollHeight - el.clientHeight,
				gutter: el.offsetWidth - el.clientWidth,
			};
		});

		expect(scroller.overflowY, "the sheet is still a native scroller").toBe(
			"auto",
		);
		expect(
			scroller.range,
			"the peek always overflows, so a classic scrollbar would always paint",
		).toBeGreaterThan(0);
		expect(scroller.scrollbarWidth, "so the scrollbar is suppressed").toBe(
			"none",
		);
		expect(
			scroller.gutter,
			"and no classic scrollbar reserves width inside the sheet",
		).toBe(0);
	});
});
