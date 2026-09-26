import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	ensureGridLocation,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	TrustedTouch,
} from "./support/app";

const VIEWPORT = { width: 412, height: 923 };
const SIDEWAYS_PX = 120;
const WOBBLE_PX = 15;
const LEAD_IN_PX = 24;
const DOWNWARD_PX = 120;
const UPWARD_PX = 250;
const DRAG_STEPS = 24;
const STEP_MS = 16;
const TOLERANCE_PX = 1;
const FOLLOW_TOLERANCE_PX = 25;
const INPUTS = ["touch", "mouse"] as const;

type Input = (typeof INPUTS)[number];

interface Point {
	x: number;
	y: number;
}

interface Surface {
	name: string;
	thumb: string;
	open: (page: Page) => Promise<Locator>;
}

async function openBrowse(page: Page) {
	await page.setViewportSize(VIEWPORT);
	await installTauriShim(page);
	await page.goto("/");
	await page
		.locator("nav a")
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await ensureGridLocation(page);
}

async function settledDialog(page: Page, name: string) {
	const dialog = page.getByRole("dialog", { name });
	await dialog.waitFor();
	await dialog.evaluate((node) =>
		Promise.all(
			node
				.getAnimations({ subtree: true })
				.map((animation) => animation.finished),
		),
	);
	await page.waitForTimeout(600);
	return dialog;
}

const AGE_QUICK_FILTER: Surface = {
	name: "age quick filter",
	thumb: "Minimum age",
	open: async (page) => {
		await openBrowse(page);
		await page.getByRole("button", { name: "Age", exact: true }).click();
		return settledDialog(page, "Age");
	},
};

const DISTANCE_QUICK_FILTER: Surface = {
	name: "inbox distance filter",
	thumb: "Maximum distance",
	open: async (page) => {
		await page.setViewportSize(VIEWPORT);
		await installTauriShim(page);
		await page.goto("/chat");
		const pill = page.getByRole("button", {
			name: "Distance",
			exact: true,
		});
		await pill.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await pill.click();
		return settledDialog(page, "Distance");
	},
};

const FULL_FILTERS: Surface = {
	name: "full filters",
	thumb: "Minimum age",
	open: async (page) => {
		await openBrowse(page);
		await page.getByRole("button", { name: "All filters" }).click();
		return settledDialog(page, "Filters");
	},
};

function sliderOf({ dialog, thumb }: { dialog: Locator; thumb: string }) {
	return dialog
		.locator("[data-slot=slider]")
		.filter({ has: dialog.page().getByRole("slider", { name: thumb }) });
}

async function centerOf(locator: Locator): Promise<Point> {
	const box = (await locator.boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function watchEdges({
	dialog,
	slider,
}: {
	dialog: Locator;
	slider: Locator;
}) {
	const sliderNode = (await slider.elementHandle())!;
	const samples = await dialog.evaluateHandle((sheet, track) => {
		const edges = { sheet: [] as number[], slider: [] as number[] };
		const sample = () => {
			edges.sheet.push(sheet.getBoundingClientRect().top);
			edges.slider.push(track.getBoundingClientRect().top);
			if (sheet.isConnected) requestAnimationFrame(sample);
		};
		sample();
		return edges;
	}, sliderNode);
	return async function expectUnmoved() {
		const drift = await samples.evaluate((edges) => {
			const farthest = (tops: number[]) =>
				Math.max(...tops.map((top) => Math.abs(top - tops[0]!)));
			return {
				sheet: farthest(edges.sheet),
				slider: farthest(edges.slider),
			};
		});
		expect(drift.sheet, "the sheet's top edge moved").toBeLessThanOrEqual(
			TOLERANCE_PX,
		);
		expect(drift.slider, "the slider scrolled").toBeLessThanOrEqual(
			TOLERANCE_PX,
		);
		await expect(dialog).toBeVisible();
	};
}

async function drag({
	page,
	input,
	from,
	path,
}: {
	page: Page;
	input: Input;
	from: Point;
	path: Point[];
}) {
	if (input === "touch") {
		const touch = await TrustedTouch.attach(page);
		await touch.start(from.x, from.y);
		for (const point of path) {
			await touch.move(point.x, point.y);
			await page.waitForTimeout(STEP_MS);
		}
		await touch.end();
	} else {
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		for (const point of path) {
			await page.mouse.move(point.x, point.y);
			await page.waitForTimeout(STEP_MS);
		}
		await page.mouse.up();
	}
	await page.waitForTimeout(600);
}

function progressSteps() {
	return Array.from(
		{ length: DRAG_STEPS },
		(_, index) => (index + 1) / DRAG_STEPS,
	);
}

function wobblyPath({
	from,
	direction,
	leadInPx,
}: {
	from: Point;
	direction: number;
	leadInPx: number;
}) {
	return progressSteps().map((progress) => {
		const travel = SIDEWAYS_PX * progress;
		const wobbling = Math.max(0, travel - leadInPx) / SIDEWAYS_PX;
		return {
			x: from.x + direction * travel,
			y: from.y + WOBBLE_PX * Math.sin(wobbling * 4 * Math.PI),
		};
	});
}

async function expectSidewaysDragMovesOnlyTheThumb({
	page,
	surface,
	input,
	leadInPx,
}: {
	page: Page;
	surface: Surface;
	input: Input;
	leadInPx: number;
}) {
	const dialog = await surface.open(page);
	const thumb = dialog.getByRole("slider", { name: surface.thumb });
	const slider = sliderOf({ dialog, thumb: surface.thumb });
	const before = await thumb.getAttribute("aria-valuenow");
	const from = await centerOf(thumb);
	const direction = (await centerOf(slider)).x >= from.x ? 1 : -1;
	const expectUnmoved = await watchEdges({ dialog, slider });

	await drag({
		page,
		input,
		from,
		path: wobblyPath({ from, direction, leadInPx }),
	});

	await expectUnmoved();
	await expect(thumb).not.toHaveAttribute("aria-valuenow", before!);
	const released = from.x + direction * SIDEWAYS_PX;
	expect(
		Math.abs((await centerOf(thumb)).x - released),
		"the thumb followed the finger to the end",
	).toBeLessThanOrEqual(FOLLOW_TOLERANCE_PX);
}

for (const surface of [AGE_QUICK_FILTER, DISTANCE_QUICK_FILTER]) {
	for (const input of INPUTS) {
		test(`a wobbly sideways ${input} drag on the ${surface.name} slider moves the thumb, not the sheet`, async ({
			page,
		}) => {
			test.setTimeout(180_000);
			await expectSidewaysDragMovesOnlyTheThumb({
				page,
				surface,
				input,
				leadInPx: 0,
			});
		});
	}
}

for (const input of INPUTS) {
	test(`a downward ${input} drag from the age quick filter slider track leaves the sheet in place`, async ({
		page,
	}) => {
		test.setTimeout(180_000);
		const dialog = await AGE_QUICK_FILTER.open(page);
		const slider = sliderOf({ dialog, thumb: AGE_QUICK_FILTER.thumb });
		const from = await centerOf(slider);
		const expectUnmoved = await watchEdges({ dialog, slider });

		await drag({
			page,
			input,
			from,
			path: progressSteps().map((progress) => ({
				x: from.x,
				y: from.y + DOWNWARD_PX * progress,
			})),
		});

		await expectUnmoved();
	});
}

for (const input of INPUTS) {
	test(`a sideways ${input} drag on a full filters slider moves the thumb, not the list`, async ({
		page,
	}) => {
		test.setTimeout(180_000);
		await expectSidewaysDragMovesOnlyTheThumb({
			page,
			surface: FULL_FILTERS,
			input,
			leadInPx: LEAD_IN_PX,
		});
	});
}

test("an upward swipe that starts on a full filters slider still scrolls the list", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const dialog = await FULL_FILTERS.open(page);
	const slider = sliderOf({ dialog, thumb: FULL_FILTERS.thumb });
	const from = await centerOf(slider);

	await drag({
		page,
		input: "touch",
		from,
		path: progressSteps().map((progress) => ({
			x: from.x,
			y: from.y - UPWARD_PX * progress,
		})),
	});

	expect((await centerOf(slider)).y).toBeLessThan(from.y - UPWARD_PX / 2);
});
