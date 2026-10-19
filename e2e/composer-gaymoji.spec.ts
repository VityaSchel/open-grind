import { expect, type Locator, type Page, test } from "@playwright/test";

import { afterTwoFrames, TrustedTouch } from "./support/app";
import { recordDemoRequests } from "./support/demo-faults";
import {
	box,
	DRAWER,
	openSheetFromComposer,
	scrollSheetTo,
} from "./support/drawer";
import {
	expectWindowed,
	mountedTiles,
	readingPosition,
	rowOffsetUnderTop,
	scrollIntoRow,
	windowLayout,
	type WindowLayout,
} from "./support/gaymoji-windows";
import {
	countGaymojiTileChurn,
	DEMO_GAYMOJI_TILE_COUNT,
	gaymojiManifestCalls,
	gaymojiPanel,
	gaymojiRegion,
	gaymojiSectionStrip,
	gaymojiTiles,
	giphyCalls,
	openGaymoji,
	openStickers,
	SELECTED_STICKER_TILE,
	STICKER_TILE,
	stickerSendButton,
	stickersTab,
	TRANSPARENT_PIXEL,
} from "./support/stickers";

const DEMO_IMAGE_PREFIX = "data:image/svg+xml,";
const DEMO_IMAGE = /^data:image\/svg\+xml,/;
const TRANSPARENT = "rgba(0, 0, 0, 0)";
const SECTION_TITLES = [
	"Wen Ching",
	"Dating & Sex",
	"Body",
	"Profile",
	"Holidays",
	"Objects",
	"Mood",
	"Other",
];
const FIRST_GAYMOJI = "wen ching 05 type";
const OTHER_GAYMOJI_COUNT = 6;
const HEADER_DRIFT_PX = 0.5;
const SCROLL_STEP_PX = 130;

function imageOf(tile: Locator): Locator {
	return tile.locator("img");
}

function imageSrc(tile: Locator): Promise<string | null> {
	return imageOf(tile).getAttribute("src");
}

function imageState(tile: Locator) {
	return imageOf(tile).evaluate(
		(image: HTMLImageElement, demoImage) => ({
			loaded:
				image.src.startsWith(demoImage) &&
				image.complete &&
				image.naturalWidth > 0,
			background: getComputedStyle(image).backgroundColor,
			pulsing: image.classList.contains("animate-pulse"),
			tileBackground: getComputedStyle(image.closest("button")!)
				.backgroundColor,
		}),
		DEMO_IMAGE_PREFIX,
	);
}

function sectionButton(page: Page, title: string): Locator {
	return gaymojiSectionStrip(page).getByRole("button", { name: title });
}

function currentSection(page: Page): Promise<string | null> {
	return gaymojiSectionStrip(page)
		.locator('[aria-current="true"]')
		.getAttribute("aria-label");
}

function titleGapUnderStrip(page: Page, title: string): Promise<number> {
	return gaymojiPanel(page).evaluate((panel, title) => {
		const strip = panel.querySelector(
			'[data-slot="gaymoji-section-strip"]',
		)!;
		const heading = [...panel.querySelectorAll("h3")].find(
			(candidate) => candidate.textContent?.trim() === title,
		)!;
		return Math.abs(
			heading.getBoundingClientRect().top -
				strip.getBoundingClientRect().bottom,
		);
	}, title);
}

function otherTiles(page: Page): Locator {
	return gaymojiRegion(page, { title: "Other" }).locator(STICKER_TILE);
}

test.describe("Gaymoji tab", () => {
	test("the manifest loads only once the tab opens, and its tiles render", async ({
		page,
	}) => {
		const requests = await recordDemoRequests(page);
		await openStickers(page);
		await page.waitForTimeout(500);
		const beforeTab = await requests();
		expect(giphyCalls(beforeTab).length).toBeGreaterThan(0);
		expect(gaymojiManifestCalls(beforeTab)).toHaveLength(0);

		await stickersTab(page, { name: "Gaymoji" }).click();
		await expect(gaymojiTiles(page).first()).toHaveAccessibleName(
			FIRST_GAYMOJI,
		);
		expect(gaymojiManifestCalls(await requests())).toHaveLength(1);

		await stickersTab(page, { name: "GIFs" }).click();
		await stickersTab(page, { name: "Gaymoji" }).click();
		await expect(gaymojiTiles(page).first()).toHaveAccessibleName(
			FIRST_GAYMOJI,
		);
		expect(gaymojiManifestCalls(await requests())).toHaveLength(1);
	});

	test("tiles far below the fold are requested only when scrolled near", async ({
		page,
	}) => {
		await openGaymoji(page, { stretchPanel: false });
		const first = gaymojiTiles(page).first();
		const lastMounted = gaymojiTiles(page).last();

		await expect.poll(() => imageSrc(first)).toMatch(DEMO_IMAGE);
		expect(await imageSrc(lastMounted)).toBe(TRANSPARENT_PIXEL);
		expect(await otherTiles(page).count()).toBe(0);
		const requested = await gaymojiTiles(page)
			.locator("img")
			.evaluateAll(
				(images, pixel) =>
					images.filter(
						(image) => image.getAttribute("src") !== pixel,
					).length,
				TRANSPARENT_PIXEL,
			);
		expect(requested).toBeGreaterThan(0);
		expect(requested).toBeLessThan(DEMO_GAYMOJI_TILE_COUNT / 4);

		await scrollSheetTo(page, { top: "end" });
		await expect(otherTiles(page)).toHaveCount(OTHER_GAYMOJI_COUNT);
		await expect
			.poll(() => imageSrc(otherTiles(page).last()))
			.toMatch(DEMO_IMAGE);
	});

	test("a loaded Gaymoji sits on a transparent tile; an unrequested one keeps a still muted tone", async ({
		page,
	}) => {
		await openGaymoji(page, { stretchPanel: false });
		const first = gaymojiTiles(page).first();
		const lastMounted = gaymojiTiles(page).last();

		await expect
			.poll(() => imageState(first))
			.toEqual({
				loaded: true,
				background: TRANSPARENT,
				pulsing: false,
				tileBackground: TRANSPARENT,
			});

		const unrequested = await imageState(lastMounted);
		expect(await imageSrc(lastMounted)).toBe(TRANSPARENT_PIXEL);
		expect(unrequested.background).not.toBe(TRANSPARENT);
		expect(unrequested.pulsing).toBe(false);
	});
});

test.describe("Gaymoji sections", () => {
	function stripScrollLeft(page: Page): Promise<number> {
		return gaymojiSectionStrip(page).evaluate(
			(strip) => (strip.firstElementChild as HTMLElement).scrollLeft,
		);
	}

	test("the strip and the titled sections follow the manifest, with Featured's originals last as Other", async ({
		page,
	}) => {
		await openGaymoji(page, { stretchPanel: false });

		expect(
			await gaymojiSectionStrip(page)
				.getByRole("button")
				.evaluateAll((buttons) =>
					buttons.map((button) => button.getAttribute("aria-label")),
				),
		).toEqual(SECTION_TITLES);
		await expect(
			gaymojiPanel(page).getByRole("heading", { level: 3 }),
		).toHaveText(SECTION_TITLES);
		expect(await currentSection(page)).toBe("Wen Ching");

		await sectionButton(page, "Other").click();
		await expect(otherTiles(page)).toHaveCount(OTHER_GAYMOJI_COUNT);
	});

	test("tapping a section lands its title right under the strip and marks it current", async ({
		page,
	}) => {
		await openGaymoji(page, { stretchPanel: false });

		for (const title of ["Holidays", "Body", "Mood"]) {
			await sectionButton(page, title).click();
			await expect
				.poll(() => titleGapUnderStrip(page, title))
				.toBeLessThan(1);
			expect(await currentSection(page)).toBe(title);
		}
	});

	test("a tap on the next section glides the collapsed sheet up through its sizes to the title", async ({
		page,
	}) => {
		await openGaymoji(page, { stretchPanel: false });
		const collapsed = await box(page);
		expect(collapsed.sheetScrollTop).toBe(0);

		const tops = await sectionButton(page, "Dating & Sex").evaluate(
			(button) =>
				new Promise<number[]>((resolve) => {
					const scroller = button.closest(
						'[data-slot="sheet-scroller"]',
					)!;
					const seen: number[] = [];
					const started = performance.now();
					const frame = () => {
						seen.push(scroller.scrollTop);
						if (performance.now() - started < 1200)
							requestAnimationFrame(frame);
						else resolve(seen);
					};
					(button as HTMLElement).click();
					seen.push(scroller.scrollTop);
					requestAnimationFrame(frame);
				}),
		);

		expect(tops[0], "no instant jump on the tap itself").toBe(0);
		expect(
			tops.filter((top) => top > 0 && top < collapsed.expandRange).length,
			"the sheet visibly rises through its sizes",
		).toBeGreaterThan(0);
		await expect
			.poll(() => titleGapUnderStrip(page, "Dating & Sex"))
			.toBeLessThan(1);
		expect(await currentSection(page)).toBe("Dating & Sex");
	});

	test("an expanded sheet keeps an opaque backdrop under its rows, so rows painted late never show the chat", async ({
		page,
	}) => {
		await openGaymoji(page, { stretchPanel: false });
		const backdrop = page.locator('[data-slot="sheet-backdrop"]');
		expect(await backdrop.count()).toBe(0);

		const titleMidView = await gaymojiPanel(page)
			.getByRole("heading", { name: "Body" })
			.evaluate((heading) => {
				const scroller = heading.closest(
					'[data-slot="sheet-scroller"]',
				)!;
				const view = scroller.getBoundingClientRect();
				return Math.round(
					scroller.scrollTop +
						heading.getBoundingClientRect().top -
						view.top -
						view.height / 2,
				);
			});
		await scrollSheetTo(page, { top: titleMidView });

		const layout = await backdrop.evaluate((element) => {
			const scroller = element.nextElementSibling as HTMLElement;
			const panel = scroller.querySelector('[data-slot="sheet-panel"]')!;
			const title = [...scroller.querySelectorAll("h3")].find(
				(heading) => heading.textContent?.trim() === "Body",
			)!;
			const own = element.getBoundingClientRect();
			const view = scroller.getBoundingClientRect();
			const titleBox = title.getBoundingClientRect();
			element.style.pointerEvents = "auto";
			const hit = document.elementFromPoint(
				titleBox.left + 4,
				titleBox.top + titleBox.height / 2,
			);
			element.style.pointerEvents = "";
			return {
				insetTop: own.top - view.top,
				insetBottom: view.bottom - own.bottom,
				insetLeft: own.left - view.left,
				insetRight: view.right - own.right,
				color: getComputedStyle(element).backgroundColor,
				panelColor: getComputedStyle(panel).backgroundColor,
				titleOverBackdrop: hit === title,
			};
		});
		expect(layout.insetTop).toBeCloseTo(32, 0);
		expect(layout.insetBottom).toBeCloseTo(0, 0);
		expect(layout.insetLeft).toBeCloseTo(0, 0);
		expect(layout.insetRight).toBeCloseTo(0, 0);
		expect(layout.color).toBe(layout.panelColor);
		expect(layout.titleOverBackdrop).toBe(true);

		await scrollSheetTo(page, { top: 0 });
		expect(await backdrop.count()).toBe(0);
	});

	test("scrolling marks the section in view and brings its strip button into view", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openGaymoji(page, { stretchPanel: false });
		expect(await stripScrollLeft(page)).toBe(0);

		await scrollSheetTo(page, { top: "end" });

		await expect.poll(() => currentSection(page)).toBe("Other");
		await expect.poll(() => stripScrollLeft(page)).toBeGreaterThan(0);
		await expect(sectionButton(page, "Other")).toBeInViewport({ ratio: 1 });
	});

	test("touch: a sideways swipe on the strip scrolls it and leaves the sheet in place", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openGaymoji(page, { stretchPanel: false });
		await page.waitForTimeout(600);
		const touch = await TrustedTouch.attach(page);
		const before = await box(page);
		const strip = await gaymojiSectionStrip(page).boundingBox();
		const y = strip!.y + strip!.height / 2;

		await touch.drag(page, { x: 300, y }, { x: 60, y: y + 6 });
		await page.waitForTimeout(600);

		expect(await stripScrollLeft(page)).toBeGreaterThan(0);
		expect(Math.abs((await box(page)).top - before.top)).toBeLessThan(2);
		await expect(gaymojiTiles(page).first()).toBeVisible();
	});

	test("touch: a slow drag down on the strip of the short sheet follows the finger and closes", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openGaymoji(page, { stretchPanel: false });
		await page.waitForTimeout(600);
		const touch = await TrustedTouch.attach(page);
		const before = await box(page);
		const strip = (await gaymojiSectionStrip(page).boundingBox())!;
		const from = { x: 195, y: strip.y + strip.height / 2 };

		await touch.drag(
			page,
			from,
			{ x: from.x, y: from.y + 240 },
			{ steps: 24, holdMs: 40, release: false },
		);
		expect(
			(await box(page)).top - before.top,
			"the sheet follows the finger",
		).toBeGreaterThan(200);

		await touch.end();
		await expect(page.locator(DRAWER)).toHaveCount(0);
	});
});

for (const { width, columns } of [
	{ width: 390, columns: 5 },
	{ width: 500, columns: 6 },
	{ width: 555, columns: 6 },
	{ width: 1280, columns: 8 },
]) {
	test.describe(`Gaymoji windowing at ${width}px`, () => {
		test.use({ viewport: { width, height: 844 } });

		test("opening the tab mounts only the rows near the view, each once", async ({
			page,
		}) => {
			const churn = await countGaymojiTileChurn(page);
			await openGaymoji(page, { stretchPanel: false });
			await afterTwoFrames(page);

			const opened = await windowLayout(page);
			expect(mountedTiles(opened)).toBeGreaterThan(columns);
			expectWindowed(opened);
			expect(await churn.read()).toEqual({
				added: mountedTiles(opened),
				removed: 0,
			});

			await page.keyboard.press("Escape");
			await expect(page.locator(DRAWER)).toHaveCount(0);
			await churn.reset();
			await openSheetFromComposer(page, {
				trigger: "GIFs and stickers",
				stretchPanel: false,
			});
			await expect(gaymojiTiles(page).first()).toBeVisible();
			await afterTwoFrames(page);

			const reopened = await windowLayout(page);
			expect(mountedTiles(reopened)).toBeGreaterThan(0);
			expectWindowed(reopened);
			expect(await churn.read()).toEqual({
				added: mountedTiles(reopened),
				removed: 0,
			});
		});

		test("scrolling through holds every header still, keeps the view filled and mounts every Gaymoji in its slot", async ({
			page,
		}) => {
			await openGaymoji(page, { stretchPanel: false });
			await afterTwoFrames(page);
			const start = await windowLayout(page);
			expectWindowed(start);
			const seen = start.sections.map(() => new Map<number, string>());
			const record = ({ sections }: WindowLayout) => {
				for (const [index, { tiles }] of sections.entries())
					for (const [slot, label] of tiles)
						seen[index]!.set(slot, label);
			};
			record(start);

			for (
				let top = start.peekPx;
				top < start.maxScrollTop + SCROLL_STEP_PX;
				top += SCROLL_STEP_PX
			) {
				await scrollSheetTo(page, {
					top: Math.min(top, start.maxScrollTop),
				});
				const layout = await windowLayout(page);
				expect(layout.scrollHeight).toBe(start.scrollHeight);
				for (const [
					index,
					{ title, headerOffset },
				] of layout.sections.entries()) {
					expect(
						Math.abs(
							headerOffset - start.sections[index]!.headerOffset,
						),
						`${title} header at scrollTop ${layout.scrollTop}`,
					).toBeLessThanOrEqual(HEADER_DRIFT_PX);
				}
				expectWindowed(layout);
				record(layout);
			}

			const slots = seen.map((tiles) =>
				[...tiles.keys()].sort((a, b) => a - b),
			);
			for (const [index, sorted] of slots.entries()) {
				expect(sorted, start.sections[index]!.title).toEqual(
					sorted.map((_, slot) => slot),
				);
			}
			expect(
				slots.reduce((total, sorted) => total + sorted.length, 0),
			).toBe(DEMO_GAYMOJI_TILE_COUNT);
			expect(seen[0]!.get(0)).toBe(FIRST_GAYMOJI);
			expect(seen.at(-1)!.size).toBe(OTHER_GAYMOJI_COUNT);
		});

		test("a selected Gaymoji stays selected after scrolling out of the window and back", async ({
			page,
		}) => {
			await openGaymoji(page, { stretchPanel: false });
			const first = gaymojiRegion(page, { title: "Wen Ching" }).getByRole(
				"button",
				{ name: FIRST_GAYMOJI, exact: true },
			);
			await first.click();
			await expect(first).toHaveAttribute("aria-pressed", "true");

			await scrollSheetTo(page, { top: "end" });
			await expect(otherTiles(page)).toHaveCount(OTHER_GAYMOJI_COUNT);
			expect(await first.count()).toBe(0);
			await expect(stickerSendButton(page)).toHaveText("Send Gaymoji");

			await scrollSheetTo(page, { top: 0 });
			await expect(first).toHaveAttribute("aria-pressed", "true");
			expect(await page.locator(SELECTED_STICKER_TILE).count()).toBe(1);
		});

		test("a jump lands a far section's title under the strip with its tiles mounted, and the last section's at the end", async ({
			page,
		}) => {
			await openGaymoji(page, { stretchPanel: false });
			expect(await otherTiles(page).count()).toBe(0);

			await sectionButton(page, "Objects").click();
			await expect
				.poll(() => titleGapUnderStrip(page, "Objects"))
				.toBeLessThan(1);
			await afterTwoFrames(page);
			const objects = await windowLayout(page);
			expectWindowed(objects);
			expect(
				objects.sections.find(({ title }) => title === "Objects")!.tiles
					.length,
			).toBeGreaterThan(0);

			await sectionButton(page, "Other").click();
			await expect.poll(() => currentSection(page)).toBe("Other");
			await expect
				.poll(async () => {
					const { scrollTop, maxScrollTop } =
						await windowLayout(page);
					return maxScrollTop - scrollTop;
				})
				.toBeLessThan(1);
			await expect(otherTiles(page)).toHaveCount(OTHER_GAYMOJI_COUNT);
			await expect(otherTiles(page).last()).toBeInViewport();
			expectWindowed(await windowLayout(page));
		});
	});
}

test.describe("Gaymoji across a width change", () => {
	for (const { from, to } of [
		{ from: 600, to: 500 },
		{ from: 500, to: 600 },
		{ from: 1280, to: 559 },
	]) {
		test(`from ${from} to ${to}px, the Gaymoji at the top of the view stays there, as far into its row`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: from, height: 844 });
			await openGaymoji(page, { stretchPanel: false });
			await afterTwoFrames(page);
			await scrollIntoRow(page, {
				title: "Profile",
				row: 4,
				fraction: 0.4,
			});
			const before = await readingPosition(page);
			if (!before) throw new Error("the top of the view is not on a row");

			await page.setViewportSize({ width: to, height: 844 });

			const anchored = gaymojiRegion(page, {
				title: before.title,
			}).getByRole("button", { name: before.label, exact: true });
			await expect(anchored).toHaveCount(1);
			await expect
				.poll(async () => {
					const { offsetPx, stridePx } =
						await rowOffsetUnderTop(anchored);
					return Math.abs(offsetPx - before.fraction * stridePx);
				})
				.toBeLessThanOrEqual(1);
			expectWindowed(await windowLayout(page));
		});
	}

	test("narrowing with the tab open lays every section out as a fresh open does", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 844 });
		await openGaymoji(page, { stretchPanel: false });
		await afterTwoFrames(page);
		await scrollSheetTo(page, { top: 1500 });

		await page.setViewportSize({ width: 640, height: 844 });
		await afterTwoFrames(page);
		await scrollSheetTo(page, { top: 1500 });
		const resized = await windowLayout(page);
		expectWindowed(resized);

		await page.keyboard.press("Escape");
		await expect(page.locator(DRAWER)).toHaveCount(0);
		await openSheetFromComposer(page, {
			trigger: "GIFs and stickers",
			stretchPanel: false,
		});
		await expect(gaymojiTiles(page).first()).toBeVisible();
		await afterTwoFrames(page);
		const fresh = await windowLayout(page);
		expect(resized.scrollHeight).toBe(fresh.scrollHeight);
		for (const [
			index,
			{ title, headerOffset },
		] of fresh.sections.entries()) {
			expect(
				Math.abs(resized.sections[index]!.headerOffset - headerOffset),
				title,
			).toBeLessThanOrEqual(HEADER_DRIFT_PX);
		}
	});
});
