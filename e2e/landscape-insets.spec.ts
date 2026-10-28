import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	animationsFinished,
	backLink,
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	meTab,
	openGrid,
} from "./support/app";
import {
	backToChats,
	openConversation,
	openInbox,
	rows,
} from "./support/chat-stack";
import { openSheetFromComposer } from "./support/drawer";
import { filtersScroller, openAllFilters } from "./support/grid-filters";
import { type Keyboard, sendInsets, sendIosInsets } from "./support/keyboard";
import { pane, stackSettled } from "./support/page-stack";
import { LIVE_STACK } from "./support/stack-layers";
import { showRestingToast } from "./support/toast";

type Insets = Keyboard["insets"];
type Span = { left: number; right: number };

const IPHONE_PORTRAIT = { width: 402, height: 874 };
const IPHONE_LANDSCAPE = { width: 874, height: 402 };
const IPHONE_PORTRAIT_INSETS: Insets = {
	top: 62,
	bottom: 34,
	left: 0,
	right: 0,
	ime: false,
};
const IPHONE_LANDSCAPE_INSETS: Insets = {
	top: 0,
	bottom: 20,
	left: 62,
	right: 62,
	ime: false,
};
const NARROW_WINDOW = { width: 540, height: 360 };
const NARROW_WINDOW_INSETS: Insets = {
	top: 24,
	bottom: 0,
	left: 48,
	right: 0,
	ime: false,
};
const ANDROID_LANDSCAPE = { width: 740, height: 360 };
const ANDROID_LANDSCAPE_INSETS: Insets = {
	top: 24,
	bottom: 0,
	left: 33,
	right: 48,
	ime: false,
};
const ANDROID_SPLIT_WINDOW = { width: 560, height: 360 };
const ANDROID_NAV_ON_THE_RIGHT: Insets = {
	top: 24,
	bottom: 0,
	left: 0,
	right: 48,
	ime: false,
};
const TINY_WINDOW = { width: 400, height: 360 };
const GRID_GUTTER = 16;
const TOAST_GUTTER = 16;
const GRID_CELLS = '[data-slot="grid-cells"]';
const GRID_CELL = 'a[href^="/profile/"]';
const COMPOSER = '[data-slot="message-composer"]';
const DIALOG = '[data-slot="dialog-content"]';
const DRAWER = '[data-slot="drawer-content"]';
const SHEET = '[data-slot="sheet-content"]';
const MESSAGE = '[data-slot="message"]';
const MESSAGES_SCROLLER = '[data-slot="messages-scroller"]';
const LOW_ROW_OFFSET = { x: 80, y: 110 };
const PAGES_TO_LOAD = 3;
const SCROLLED_INTO_GRID = 2500;

test.describe.configure({ timeout: 180_000 });

const safeSpan = (
	viewport: { width: number },
	insets: Pick<Insets, "left" | "right">,
	gutter = 0,
): Span => ({
	left: insets.left + gutter,
	right: viewport.width - insets.right - gutter,
});

async function spanOf(target: Locator): Promise<Span> {
	const box = await target.boundingBox();
	if (!box) throw new Error("Nothing to measure");
	return { left: box.x, right: box.x + box.width };
}

async function expectInside(target: Locator, safe: Span, label: string) {
	const span = await spanOf(target);
	expect(span.left, `${label} starts past the left cutout`).toBeGreaterThan(
		safe.left - 0.5,
	);
	expect(span.right, `${label} ends before the right cutout`).toBeLessThan(
		safe.right + 0.5,
	);
}

async function expectEdgeToEdge(target: Locator, width: number, label: string) {
	const span = await spanOf(target);
	expect(span, `${label} spans the whole screen`).toEqual({
		left: 0,
		right: width,
	});
}

async function startOnIos(page: Page, insets: Insets): Promise<void> {
	await installTauriShim(page, { platform: "ios" });
	await page.addInitScript((preset) => {
		window.__iosInsets = preset;
	}, insets);
}

async function expectCenteredInside(
	target: Locator,
	safe: Span,
	label: string,
) {
	await animationsFinished(target);
	await expectInside(target, safe, label);
	const span = await spanOf(target);
	expect(
		(span.left + span.right) / 2,
		`${label} is centered between the cutouts`,
	).toBeCloseTo((safe.left + safe.right) / 2, 0);
}

function firstGridRow(page: Page) {
	return page.locator(GRID_CELLS).evaluate((grid, cellSelector) => {
		const boxes = [...grid.querySelectorAll(cellSelector)].map((cell) =>
			cell.getBoundingClientRect(),
		);
		const top = Math.min(...boxes.map((box) => box.top));
		const row = boxes.filter((box) => Math.abs(box.top - top) < 1);
		return {
			columns: row.length,
			left: Math.round(Math.min(...row.map((box) => box.left))),
			right: Math.round(Math.max(...row.map((box) => box.right))),
		};
	}, GRID_CELL);
}

function gridScroller(page: Page) {
	return page
		.locator('[data-slot="grid-content"]')
		.locator("xpath=..")
		.first();
}

async function scrollGridIntoLaterPages(page: Page): Promise<void> {
	const scroller = gridScroller(page);
	for (let loaded = 0; loaded < PAGES_TO_LOAD; loaded++) {
		await scroller.evaluate((element) =>
			element.scrollTo({ top: element.scrollHeight }),
		);
		await page.waitForTimeout(400);
	}
	await scroller.evaluate(
		(element, top) => element.scrollTo({ top }),
		SCROLLED_INTO_GRID,
	);
	await page.waitForTimeout(600);
}

function gridRowLayout(page: Page) {
	return page.locator(GRID_CELLS).evaluate((grid, cellSelector) => {
		const scroller = grid.closest(
			'[data-slot="grid-content"]',
		)!.parentElement!;
		const style = getComputedStyle(grid);
		const tracks = style.gridTemplateColumns.trim().split(/\s+/);
		const stride = parseFloat(tracks[0]!) + parseFloat(style.rowGap);
		const gridTop = grid.getBoundingClientRect().top;
		const view = scroller.getBoundingClientRect();
		const rowsUsed = new Set<number>();
		let offGrid = 0;
		for (const cell of grid.querySelectorAll(cellSelector)) {
			const top = cell.getBoundingClientRect().top - gridTop;
			const row = Math.round(top / stride);
			rowsUsed.add(row);
			if (Math.abs(row * stride - top) > 1) offGrid++;
		}
		const ordered = [...rowsUsed].sort((a, b) => a - b);
		return {
			columns: tracks.length,
			offGrid,
			holes: ordered.filter(
				(row, index) => index > 0 && row - ordered[index - 1]! !== 1,
			).length,
			coversView:
				ordered.length > 0 &&
				gridTop + ordered[0]! * stride <= view.top &&
				gridTop + (ordered.at(-1)! + 1) * stride >= view.bottom,
		};
	}, GRID_CELL);
}

function newestAtRestAboveComposer(page: Page) {
	return page.evaluate(
		({ message, scroller, composer }) => {
			const list = document.querySelector(scroller);
			const newest = list && [...list.querySelectorAll(message)].at(-1);
			const form = document.querySelector(composer);
			if (!list || !newest || !form) return false;
			const floorDistance =
				list.scrollHeight - list.clientHeight - list.scrollTop;
			return (
				floorDistance <= 1 &&
				newest.getBoundingClientRect().bottom <=
					form.getBoundingClientRect().top + 0.5
			);
		},
		{ message: MESSAGE, scroller: MESSAGES_SCROLLER, composer: COMPOSER },
	);
}

test.describe("on an iPhone in landscape", () => {
	test.use({ viewport: IPHONE_LANDSCAPE });

	test("the Browse grid fits four columns between the cutouts", async ({
		page,
	}) => {
		await startOnIos(page, IPHONE_LANDSCAPE_INSETS);
		await openGrid(page);
		await page
			.locator(GRID_CELL)
			.first()
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		expect(await firstGridRow(page)).toEqual({
			columns: 4,
			...safeSpan(IPHONE_LANDSCAPE, IPHONE_LANDSCAPE_INSETS, GRID_GUTTER),
		});
	});

	test("the Browse grid gains a column on the same rows when only the insets narrow", async ({
		page,
	}) => {
		const narrower = { ...IPHONE_LANDSCAPE_INSETS, left: 0, right: 48 };
		await startOnIos(page, IPHONE_LANDSCAPE_INSETS);
		await openGrid(page);
		await page
			.locator(GRID_CELL)
			.first()
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await scrollGridIntoLaterPages(page);
		expect((await gridRowLayout(page)).columns).toBe(4);

		await sendIosInsets(page, narrower);

		await expect
			.poll(() => gridRowLayout(page))
			.toEqual({ columns: 5, offGrid: 0, holes: 0, coversView: true });
	});

	test("the Browse bars span the screen while their controls clear the cutouts", async ({
		page,
	}) => {
		await startOnIos(page, IPHONE_LANDSCAPE_INSETS);
		await openGrid(page);
		const safe = safeSpan(IPHONE_LANDSCAPE, IPHONE_LANDSCAPE_INSETS);
		const mainNavigation = page.getByRole("navigation", { name: "Main" });
		const changeLocation = page.getByRole("button", {
			name: "Change location",
		});

		await expectEdgeToEdge(
			mainNavigation,
			IPHONE_LANDSCAPE.width,
			"the nav bar",
		);
		await expectInside(
			mainNavigation.locator('[data-scroll-intent="x"]'),
			safe,
			"the nav bar's tab scroller",
		);
		await expectEdgeToEdge(
			page
				.locator("[data-screen-chrome]")
				.filter({ has: changeLocation }),
			IPHONE_LANDSCAPE.width,
			"the top bar",
		);
		expect(
			(await spanOf(changeLocation)).left,
			"the first top bar chip keeps its gutter past the left cutout",
		).toBeCloseTo(IPHONE_LANDSCAPE_INSETS.left + GRID_GUTTER, 0);
	});

	test("a settings page keeps its header edge to edge and its back link past the left cutout", async ({
		page,
	}) => {
		await startOnIos(page, IPHONE_LANDSCAPE_INSETS);
		await page.goto("/settings/account");
		await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await stackSettled(page);
		await backLink(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		await expectEdgeToEdge(
			page.getByRole("navigation", { name: "Page" }),
			IPHONE_LANDSCAPE.width,
			"the settings header",
		);
		expect((await spanOf(backLink(page))).left).toBeCloseTo(
			IPHONE_LANDSCAPE_INSETS.left,
			0,
		);
	});

	test("the filters sheet paints edge to edge and keeps its controls between the cutouts", async ({
		page,
	}) => {
		const safe = safeSpan(IPHONE_LANDSCAPE, IPHONE_LANDSCAPE_INSETS);
		await startOnIos(page, IPHONE_LANDSCAPE_INSETS);
		await openGrid(page);
		await openAllFilters(page);
		await animationsFinished(page.locator(SHEET));

		await expectEdgeToEdge(
			page.locator(SHEET),
			IPHONE_LANDSCAPE.width,
			"the filters sheet",
		);
		await expectInside(filtersScroller(page), safe, "the filters");
		await expectInside(
			page.getByRole("button", { name: "Apply" }),
			safe,
			"the Apply button",
		);
	});

	test("the attachments drawer stays between the cutouts", async ({
		page,
	}) => {
		await startOnIos(page, IPHONE_LANDSCAPE_INSETS);
		await page.goto(DEMO_CONVERSATION);
		await openSheetFromComposer(page, {
			trigger: "Add attachment",
			stretchPanel: false,
		});

		await expectCenteredInside(
			page.locator(DRAWER),
			safeSpan(IPHONE_LANDSCAPE, IPHONE_LANDSCAPE_INSETS),
			"the attachments drawer",
		);
	});

	test("the location dialog is centered between the cutouts", async ({
		page,
	}) => {
		await startOnIos(page, IPHONE_LANDSCAPE_INSETS);
		await openGrid(page);
		await page.getByRole("button", { name: "Change location" }).click();
		await page.locator(DIALOG).waitFor();

		await expectCenteredInside(
			page.locator(DIALOG),
			safeSpan(IPHONE_LANDSCAPE, IPHONE_LANDSCAPE_INSETS),
			"the location dialog",
		);
	});

	test("after rotating into the split layout the newest message sits above the composer, inside the cutouts", async ({
		page,
	}) => {
		await page.setViewportSize(IPHONE_PORTRAIT);
		await startOnIos(page, IPHONE_PORTRAIT_INSETS);
		await page.goto(DEMO_CONVERSATION);
		await page
			.locator(COMPOSER)
			.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await expect(page.locator(LIVE_STACK.sheet)).toHaveCount(1);

		await page.setViewportSize(IPHONE_LANDSCAPE);
		await afterTwoFrames(page);
		await sendIosInsets(page, IPHONE_LANDSCAPE_INSETS);

		await expect(page.locator(LIVE_STACK.sheet)).toHaveCount(0);
		await page.locator(MESSAGE).first().waitFor();
		await expect.poll(() => newestAtRestAboveComposer(page)).toBe(true);
		await expectInside(
			page.locator(COMPOSER),
			safeSpan(IPHONE_LANDSCAPE, IPHONE_LANDSCAPE_INSETS),
			"the composer",
		);
	});
});

test.describe("on an Android phone in landscape", () => {
	test.use({ viewport: ANDROID_LANDSCAPE });

	test("the location drawer stays between the cutout and the navigation bar", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "android" });
		await openGrid(page);
		await sendInsets(page, ANDROID_LANDSCAPE_INSETS);
		await page.getByRole("button", { name: "Change location" }).click();
		await page.locator(DRAWER).waitFor();

		await expectCenteredInside(
			page.locator(DRAWER),
			safeSpan(ANDROID_LANDSCAPE, ANDROID_LANDSCAPE_INSETS),
			"the location drawer",
		);
	});
});

test.describe("on an Android window as narrow as toasts go full width", () => {
	test.use({ viewport: ANDROID_SPLIT_WINDOW });

	test("a toast keeps its gutter from the navigation bar on the right", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "android" });
		await page.goto("/");
		await meTab(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await sendInsets(page, ANDROID_NAV_ON_THE_RIGHT);

		const toast = await showRestingToast({
			page,
			edge: "bottom",
			label: "Landscape probe",
		});
		const span = await spanOf(toast);
		const safe = safeSpan(
			ANDROID_SPLIT_WINDOW,
			ANDROID_NAV_ON_THE_RIGHT,
			TOAST_GUTTER,
		);

		expect(span.left).toBeCloseTo(safe.left, 0);
		expect(span.right).toBeCloseTo(safe.right, 0);
	});
});

test.describe("on a made-up narrow window beside a cutout", () => {
	test.use({ viewport: NARROW_WINDOW });

	test("the inbox and the conversation stacked over it keep clear of the cutout", async ({
		page,
	}) => {
		const safe = safeSpan(NARROW_WINDOW, NARROW_WINDOW_INSETS);
		await openInbox(page, { platform: "android" });
		await sendInsets(page, NARROW_WINDOW_INSETS);

		await expectInside(rows(page).nth(1), safe, "a conversation row");

		await openConversation(page);
		await expect(page.locator(LIVE_STACK.sheet)).toHaveCount(1);

		expect((await spanOf(backToChats(page))).left).toBeGreaterThan(
			safe.left - 0.5,
		);
		await expectInside(page.locator(COMPOSER), safe, "the composer");
	});

	test("an alert dialog is centered between the cutout and the far edge", async ({
		page,
	}) => {
		await page.setViewportSize(TINY_WINDOW);
		await installTauriShim(page, { platform: "android" });
		await page.goto("/settings");
		const signOut = page.getByRole("button", {
			name: "Sign Out",
			exact: true,
		});
		await signOut.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await sendInsets(page, NARROW_WINDOW_INSETS);
		await signOut.click();
		const alert = page.getByRole("alertdialog", { name: "Sign out?" });
		await alert.waitFor();

		await expectCenteredInside(
			alert,
			safeSpan(TINY_WINDOW, NARROW_WINDOW_INSETS),
			"the sign-out alert",
		);
		await alert.getByRole("button", { name: "Cancel" }).click();
	});

	test("the unsupported notifications message stays centered between the cutout and the far edge", async ({
		page,
	}) => {
		await startOnIos(page, NARROW_WINDOW_INSETS);
		await page.goto("/settings/app/notifications");
		const message = page.getByText(
			"Notifications are not supported on this platform yet.",
		);
		await message.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await stackSettled(page);

		const span = await spanOf(message);
		const safe = safeSpan(NARROW_WINDOW, NARROW_WINDOW_INSETS);

		expect((span.left + span.right) / 2).toBeCloseTo(
			(safe.left + safe.right) / 2,
			0,
		);
	});
});

test.describe("with a mouse on a short landscape screen", () => {
	test.use({ viewport: IPHONE_LANDSCAPE });

	test("a conversation menu opened low in the list shifts up to clear the bottom inset", async ({
		page,
	}) => {
		await installTauriShim(page, { platform: "macos" });
		await page.goto("/chat");
		await rows(page).nth(3).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		await sendInsets(page, IPHONE_LANDSCAPE_INSETS);
		const low = {
			x: IPHONE_LANDSCAPE_INSETS.left + LOW_ROW_OFFSET.x,
			y: IPHONE_LANDSCAPE.height - LOW_ROW_OFFSET.y,
		};
		expect(
			await page.evaluate(
				({ x, y }) =>
					document
						.elementFromPoint(x, y)
						?.closest('a[href^="/chat/"]') instanceof
					HTMLAnchorElement,
				low,
			),
			"the point lands on a conversation row",
		).toBe(true);

		await page.mouse.click(low.x, low.y, { button: "right" });
		const menu = page.getByRole("menu");
		await menu.waitFor();
		await animationsFinished(menu);
		const box = await menu.boundingBox();

		expect(box!.y + box!.height).toBeLessThan(
			IPHONE_LANDSCAPE.height - IPHONE_LANDSCAPE_INSETS.bottom + 0.5,
		);
	});
});
