import { expect, type Locator, type Page, test } from "@playwright/test";

import { back, openAlbum, openAlbums, SHARED_ALBUM } from "./support/albums";

type Box = { x: number; y: number; width: number; height: number };

type HeaderBoxes = { header: Box; preview: Box; name: Box };

declare global {
	interface Window {
		__albumSkeleton?: { header: Box; preview: Box };
	}
}

const HEADER = '[data-slot="album-header"]';
const PREVIEW_COLUMN = '[data-slot="album-header-preview"]';
const FIELDS_COLUMN = '[data-slot="album-header-fields"]';

const LAYOUTS = [
	{ viewport: { width: 420, height: 800 }, twoColumns: false },
	{ viewport: { width: 560, height: 800 }, twoColumns: true },
	{ viewport: { width: 1280, height: 800 }, twoColumns: true },
];

async function boxOf(locator: Locator): Promise<Box> {
	const box = await locator.boundingBox();
	if (box === null) throw new Error("element is not rendered");
	return box;
}

async function measureHeader(page: Page): Promise<HeaderBoxes> {
	return {
		header: await boxOf(page.locator(HEADER)),
		preview: await boxOf(page.locator(`${PREVIEW_COLUMN} > *`)),
		name: await boxOf(page.getByRole("textbox", { name: "Album name" })),
	};
}

function expectSameBox({
	actual,
	expected,
	label,
}: {
	actual: Box;
	expected: Box;
	label: string;
}): void {
	for (const key of ["x", "y", "width", "height"] as const) {
		expect(
			Math.abs(actual[key] - expected[key]),
			`${label} ${key}: ${actual[key]} vs ${expected[key]}`,
		).toBeLessThanOrEqual(1);
	}
}

function expectNear({
	actual,
	expected,
	label,
}: {
	actual: number;
	expected: number;
	label: string;
}): void {
	expect(
		Math.abs(actual - expected),
		`${label}: ${actual} vs ${expected}`,
	).toBeLessThanOrEqual(1);
}

function expectHeaderLayout({
	boxes: { header, preview, name },
	twoColumns,
}: {
	boxes: HeaderBoxes;
	twoColumns: boolean;
}): void {
	const headerRight = header.x + header.width;
	if (twoColumns) {
		expectNear({ actual: preview.width, expected: 120, label: "width" });
		expectNear({ actual: preview.height, expected: 160, label: "height" });
		expectNear({ actual: preview.x, expected: header.x, label: "left" });
		expectNear({ actual: preview.y, expected: header.y, label: "top" });
		expectNear({ actual: name.y, expected: preview.y, label: "tops" });
		expectNear({
			actual: name.x,
			expected: preview.x + preview.width + 16,
			label: "column gap",
		});
	} else {
		expectNear({ actual: preview.width, expected: 128, label: "width" });
		expectNear({
			actual: preview.height,
			expected: (128 * 4) / 3,
			label: "height",
		});
		expectNear({
			actual: preview.x + preview.width / 2,
			expected: header.x + header.width / 2,
			label: "centered",
		});
		expectNear({
			actual: name.y,
			expected: preview.y + preview.height + 12,
			label: "stacked",
		});
		expectNear({ actual: name.x, expected: header.x, label: "full width" });
	}
	expectNear({
		actual: name.x + name.width,
		expected: headerRight,
		label: "name reaches the right edge",
	});
}

async function expectNothingClipped(page: Page): Promise<void> {
	const clipped = await page.evaluate(
		({ header, fields }) => {
			const scroller = document.scrollingElement;
			const column = document.querySelector(fields);
			const root = document.querySelector(header);
			if (scroller === null || column === null || root === null) {
				return ["header not found"];
			}
			const right = column.getBoundingClientRect().right;
			const spilled = [...column.querySelectorAll("*")]
				.filter(
					(element) =>
						element.getBoundingClientRect().right > right + 0.5 ||
						element.scrollWidth > element.clientWidth,
				)
				.map((element) => element.outerHTML.slice(0, 120));
			if (root.scrollWidth > root.clientWidth) spilled.push("header");
			if (scroller.scrollWidth > window.innerWidth) spilled.push("page");
			return spilled;
		},
		{ header: HEADER, fields: FIELDS_COLUMN },
	);
	expect(clipped).toEqual([]);
}

async function recordLoadingSkeleton(page: Page): Promise<void> {
	await page.addInitScript(
		({ header, preview }) => {
			const boxOfElement = (element: Element): Box => {
				const { x, y, width, height } = element.getBoundingClientRect();
				return { x, y, width, height };
			};
			new MutationObserver(() => {
				if (window.__albumSkeleton !== undefined) return;
				const box = document.querySelector(
					`${preview} > [data-slot="skeleton"]`,
				);
				const root = box?.closest(header) ?? null;
				if (box === null || root === null) return;
				window.__albumSkeleton = {
					header: boxOfElement(root),
					preview: boxOfElement(box),
				};
			}).observe(document, { childList: true, subtree: true });
		},
		{ header: HEADER, preview: PREVIEW_COLUMN },
	);
}

for (const { viewport, twoColumns } of LAYOUTS) {
	test.describe(`album header at ${viewport.width}px`, () => {
		test.use({ viewport });

		test("the editor and its loading skeleton draw the same header", async ({
			page,
		}) => {
			await recordLoadingSkeleton(page);
			await openAlbums(page);
			await page.locator(SHARED_ALBUM).click();
			await expect(
				page.getByRole("button", { name: "Preview album" }),
			).toBeVisible();
			await expect(page.getByText(/^\d+\/\d+ photos, /)).toBeVisible();

			const editor = await measureHeader(page);
			expectHeaderLayout({ boxes: editor, twoColumns });
			await expectNothingClipped(page);

			const skeleton = await page.evaluate(() => window.__albumSkeleton);
			expect(skeleton, "the loading skeleton rendered").toBeDefined();
			if (skeleton === undefined) return;
			expectSameBox({
				actual: skeleton.preview,
				expected: editor.preview,
				label: "skeleton preview",
			});
			expectSameBox({
				actual: skeleton.header,
				expected: editor.header,
				label: "skeleton header",
			});
		});

		test("a new album lays out its header like the editor", async ({
			page,
		}) => {
			await openAlbum(page, SHARED_ALBUM);
			const editor = await measureHeader(page);

			await back(page);
			await page.getByRole("link", { name: "Add album" }).click();
			await expect(
				page.locator(`${PREVIEW_COLUMN} > [data-slot="empty-media"]`),
			).toBeVisible();

			const created = await measureHeader(page);
			expectHeaderLayout({ boxes: created, twoColumns });
			await expectNothingClipped(page);
			expectSameBox({
				actual: created.preview,
				expected: editor.preview,
				label: "new album preview",
			});
			expectSameBox({
				actual: created.name,
				expected: editor.name,
				label: "new album name",
			});
		});
	});
}
