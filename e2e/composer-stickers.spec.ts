import { expect, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	installTauriShim,
	MESSAGE_ROW,
	TrustedTouch,
	wheel,
} from "./support/app";
import { holdDemoRequests } from "./support/demo-faults";
import {
	box,
	DRAWER,
	expandToFull,
	openComposerSheet,
	SHEET_PANEL,
	snapTops,
} from "./support/drawer";
import {
	GAYMOJI_MANIFEST_PATH,
	gaymojiPanel,
	gaymojiTiles,
	gifPanel,
	gifSearchBox,
	gifTiles,
	GIPHY_MESSAGE,
	openGaymoji,
	openStickers,
	SELECTED_STICKER_TILE,
	sendGif,
	showGaymojiTab,
	STICKER_GRID_SKELETON,
	STICKER_TILE,
	stickerSendButton,
	stickersTab,
	visibleColumns,
	visibleTileAspectRatios,
} from "./support/stickers";

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
		const tile = gifTiles(page).first();
		const rect = (await tile.boundingBox())!;
		const centre = {
			x: rect.x + rect.width / 2,
			y: rect.y + rect.height / 2,
		};
		await touch.drag(page, centre, { x: centre.x, y: centre.y - 120 });
		await page.waitForTimeout(1000);
		await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(0);

		const still = (await gifTiles(page).first().boundingBox())!;
		await touch.start(
			still.x + still.width / 2,
			still.y + still.height / 2,
		);
		await page.waitForTimeout(60);
		await touch.end();
		await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(1);
	});

	for (const { noun, tab, tiles, label } of [
		{ noun: "GIF", tab: "GIFs", tiles: gifTiles, label: "Send GIF" },
		{
			noun: "Gaymoji",
			tab: "Gaymoji",
			tiles: gaymojiTiles,
			label: "Send Gaymoji",
		},
	] as const) {
		test(`one ${noun} at a time is selected, and Send shows no count`, async ({
			page,
		}) => {
			await openStickers(page);
			await stickersTab(page, { name: tab }).click();
			const first = tiles(page).nth(0);
			const second = tiles(page).nth(1);
			await expect(first).toBeVisible();

			await first.click();
			await expect(first).toHaveAttribute("aria-pressed", "true");
			await expect(stickerSendButton(page)).toHaveText(label);

			await second.click();
			await expect(second).toHaveAttribute("aria-pressed", "true");
			await expect(first).toHaveAttribute("aria-pressed", "false");
			await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(1);
			await expect(stickerSendButton(page)).toHaveText(label);

			await second.click();
			await expect(second).toHaveAttribute("aria-pressed", "false");
			await expect(page.locator(SELECTED_STICKER_TILE)).toHaveCount(0);
			await expect(stickerSendButton(page)).toHaveCount(0);
		});
	}

	test("a sent GIF closes the sheet and plays in the chat", async ({
		page,
	}) => {
		await sendGif(page);

		await expect(page.locator(DRAWER)).toHaveCount(0);
		const newest = page.locator(MESSAGE_ROW).last();
		await expect(newest.getByText("Sending...")).toHaveCount(0);
		const gif = newest
			.locator(GIPHY_MESSAGE)
			.getByRole("img", { name: "GIF" });
		await expect(gif).toBeVisible();
		await expect(gif).toHaveJSProperty("complete", true);
		expect(
			await gif.evaluate((image: HTMLImageElement) => image.naturalWidth),
		).toBeGreaterThan(1);
	});

	test("a sent GIF lines up with the sent text bubbles", async ({ page }) => {
		await sendGif(page);
		await expect(page.locator(DRAWER)).toHaveCount(0);
		await page
			.getByRole("textbox", { name: "Say something..." })
			.fill("Lined up?");
		await page.getByRole("button", { name: "Send message" }).click();

		const gif = page.locator(GIPHY_MESSAGE).last();
		const bubble = page
			.locator('[data-slot="message-bubble"]')
			.filter({ hasText: "Lined up?" });
		await expect(bubble).toBeVisible();
		const [gifBox, bubbleBox] = await Promise.all([
			gif.boundingBox(),
			bubble.boundingBox(),
		]);
		expect(
			(gifBox?.x ?? 0) +
				(gifBox?.width ?? 0) -
				((bubbleBox?.x ?? 0) + (bubbleBox?.width ?? 0)),
		).toBeCloseTo(0, 0);
	});

	test("a sent Gaymoji closes the sheet and stays a Gaymoji in the chat", async ({
		page,
	}) => {
		await openGaymoji(page);
		const tile = gaymojiTiles(page).nth(2);
		await expect(tile).toBeVisible();
		const name = (await tile.getAttribute("aria-label")) ?? "";

		await tile.click();
		await stickerSendButton(page).click();

		await expect(page.locator(DRAWER)).toHaveCount(0);
		const newest = page.locator(MESSAGE_ROW).last();
		await expect(newest.getByText("Sending...")).toHaveCount(0);
		await expect(
			newest
				.locator('[data-slot="gaymoji-message"]')
				.getByRole("img", { name }),
		).toBeVisible();
	});

	test("a Send pill flying out turns back from where it is when a tile is picked again", async ({
		page,
	}) => {
		await openGaymoji(page);
		const tile = gaymojiTiles(page).nth(0);
		await tile.click();
		await expect(stickerSendButton(page)).toBeVisible();
		await page.waitForTimeout(800);

		type Sample = { at: number; offset: number; opacity: number };
		const flight = await tile.evaluate(
			(tileElement) =>
				new Promise<{ turn: Sample; samples: Sample[] }>((resolve) => {
					const pill = () =>
						document.querySelector<HTMLElement>(
							'[data-slot="sheet-actions"]',
						)!;
					const samples: Sample[] = [];
					let started = 0;
					const measure = (): Sample => {
						const style = getComputedStyle(pill());
						return {
							at: performance.now() - started,
							offset: new DOMMatrix(style.transform).m42,
							opacity: Number(style.opacity),
						};
					};
					(tileElement as HTMLElement).click();
					setTimeout(() => {
						started = performance.now();
						const turn = measure();
						(tileElement as HTMLElement).click();
						const sample = () => {
							samples.push(measure());
							if (performance.now() - started < 900)
								requestAnimationFrame(sample);
							else resolve({ turn, samples });
						};
						requestAnimationFrame(sample);
					}, 260);
				}),
		);

		const { turn, samples } = flight;
		expect(turn.offset, "the pill was well on its way out").toBeGreaterThan(
			20,
		);
		expect(
			Math.max(...samples.map(({ offset }) => offset)),
			"the pill turns back without dropping below where it was",
		).toBeLessThanOrEqual(turn.offset + 25);
		expect(
			Math.min(...samples.map(({ opacity }) => opacity)),
			"the pill never fades further once it turns",
		).toBeGreaterThanOrEqual(turn.opacity - 0.15);
		expect(
			samples.some(
				({ at, offset }) => at <= 300 && offset < turn.offset / 2,
			),
			"the pill is halfway home within 300 ms, not stalled",
		).toBe(true);
		expect(samples.at(-1)).toMatchObject({ offset: 0, opacity: 1 });
	});

	test("switching tabs keeps the GIF search and its results", async ({
		page,
	}) => {
		await openStickers(page);
		await gifSearchBox(page).fill("party");
		const firstResult = gifPanel(page).getByRole("button", {
			name: "Party GIF 1",
			exact: true,
		});
		await expect(firstResult).toBeVisible();
		const results = await gifTiles(page).count();

		await showGaymojiTab(page);
		await expect(gifSearchBox(page)).toBeHidden();

		await stickersTab(page, { name: "GIFs" }).click();
		await expect(gifSearchBox(page)).toHaveValue("party");
		await expect(firstResult).toBeVisible();
		expect(await gifTiles(page).count()).toBe(results);
	});
});

test.describe("sticker grid layout", () => {
	const SHEET_PANEL_PADDING = 32;
	const MEDIA_PANEL_WIDTH = 800;
	const LAYOUTS = [
		{ viewport: 1280, grid: 768, gifs: 3, gaymoji: 8 },
		{ viewport: 720, grid: 688, gifs: 3, gaymoji: 8 },
		{ viewport: 640, grid: 608, gifs: 3, gaymoji: 7 },
		{ viewport: 520, grid: 488, gifs: 3, gaymoji: 6 },
		{ viewport: 420, grid: 388, gifs: 3, gaymoji: 5 },
		{ viewport: 280, grid: 248, gifs: 2, gaymoji: 4 },
		{ viewport: 200, grid: 168, gifs: 1, gaymoji: 3 },
	];

	function visibleGridWidth(page: Page): Promise<number | undefined> {
		return page.evaluate(
			() =>
				[
					...document.querySelectorAll<HTMLElement>(
						'[data-slot="sticker-grid"]',
					),
				]
					.find((grid) => grid.checkVisibility())
					?.getBoundingClientRect().width,
		);
	}

	async function measureTab(page: Page, name: "GIFs" | "Gaymoji") {
		await stickersTab(page, { name }).click();
		const tiles = name === "GIFs" ? gifTiles(page) : gaymojiTiles(page);
		await expect(tiles.first()).toBeVisible();
		await page.waitForTimeout(100);
		return {
			grid: await visibleGridWidth(page),
			columns: await visibleColumns(page),
		};
	}

	test("the grids drop columns as the sheet narrows", async ({ page }) => {
		await openStickers(page);
		const panelPadding = await page
			.locator(DRAWER)
			.locator(SHEET_PANEL)
			.evaluate((panel) => {
				const style = getComputedStyle(panel);
				return (
					parseFloat(style.paddingLeft) +
					parseFloat(style.paddingRight)
				);
			});
		expect(panelPadding).toBe(SHEET_PANEL_PADDING);

		for (const { viewport, grid, gifs, gaymoji } of LAYOUTS) {
			expect(
				Math.min(viewport, MEDIA_PANEL_WIDTH) - SHEET_PANEL_PADDING,
			).toBe(grid);
			await page.setViewportSize({ width: viewport, height: 800 });
			const gifLayout = await measureTab(page, "GIFs");
			const gaymojiLayout = await measureTab(page, "Gaymoji");
			expect({
				viewport,
				gifGrid: gifLayout.grid,
				gifColumns: gifLayout.columns,
				gaymojiGrid: gaymojiLayout.grid,
				gaymojiColumns: gaymojiLayout.columns,
			}).toEqual({
				viewport,
				gifGrid: grid,
				gifColumns: gifs,
				gaymojiGrid: grid,
				gaymojiColumns: gaymoji,
			});
		}
	});

	test("the Gaymoji skeleton fills three whole rows at every width", async ({
		page,
	}) => {
		await holdDemoRequests(page, { pathPrefix: GAYMOJI_MANIFEST_PATH });
		await openStickers(page);
		await stickersTab(page, { name: "Gaymoji" }).click();
		const skeleton = gaymojiPanel(page).locator(STICKER_GRID_SKELETON);
		await expect(skeleton).toBeVisible();

		for (const { viewport, gaymoji } of LAYOUTS) {
			await page.setViewportSize({ width: viewport, height: 800 });
			await page.waitForTimeout(100);
			const layout = await skeleton.evaluate((grid) => {
				const tiles = [...grid.children].filter((tile) =>
					tile.checkVisibility(),
				);
				return {
					tiles: tiles.length,
					rows: new Set(
						tiles.map((tile) =>
							Math.round(tile.getBoundingClientRect().top),
						),
					).size,
				};
			});
			expect({ viewport, ...layout }).toEqual({
				viewport,
				tiles: gaymoji * 3,
				rows: 3,
			});
		}
	});

	test("GIF tiles are 4:3 and Gaymoji tiles are square", async ({ page }) => {
		await openStickers(page);
		const gifRatios = await visibleTileAspectRatios(page);
		expect(gifRatios.length).toBeGreaterThan(3);
		for (const ratio of gifRatios) expect(ratio).toBeCloseTo(4 / 3, 1);

		await showGaymojiTab(page);
		const gaymojiRatios = await visibleTileAspectRatios(page);
		expect(gaymojiRatios.length).toBeGreaterThan(3);
		for (const ratio of gaymojiRatios) expect(ratio).toBeCloseTo(1, 1);
	});
});

test.describe("composer sheet tab bars", () => {
	const SHEETS = [
		{
			trigger: "Add attachment",
			tile: '[data-slot="media-tile"]',
			preferences: undefined,
		},
		{
			trigger: "GIFs and stickers",
			tile: STICKER_TILE,
			preferences: { giphyConsent: true },
		},
	] as const;

	for (const { trigger, tile, preferences } of SHEETS) {
		test(`${trigger}: the tab bar is a progressive blur under the Send pill`, async ({
			page,
		}) => {
			await openComposerSheet(page, { trigger, preferences });
			const bar = page
				.locator(DRAWER)
				.locator('[data-slot="media-sheet-tab-bar"]');
			const visibleLayers = () =>
				bar.evaluate(
					(el) =>
						[...el.querySelectorAll(".pblur-layer")].filter(
							(layer) =>
								getComputedStyle(layer).display !== "none",
						).length,
				);
			expect(await visibleLayers()).toBe(9);

			await page.locator(tile).first().click();
			const pill = page.locator('[data-slot="sheet-actions"]');
			await expect(pill).toBeVisible();
			await pill.evaluate((el) =>
				Promise.all(el.getAnimations().map((a) => a.finished)),
			);
			const gap = async () => {
				const pillBox = (await pill.boundingBox())!;
				const barBox = (await bar.boundingBox())!;
				return barBox.y - (pillBox.y + pillBox.height);
			};
			const fullGap = await gap();
			expect(fullGap, "the pill clears the bar").toBeGreaterThanOrEqual(
				0,
			);

			await page.evaluate(() =>
				document.documentElement.setAttribute(
					"data-backdrop-blur",
					"min",
				),
			);
			expect(await visibleLayers()).toBe(1);
			expect((await gap()) - fullGap).toBeCloseTo(12, 0);
		});
	}
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
