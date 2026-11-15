import { expect, type Locator, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import {
	FIRST_ROUTE_COMPILE_MS,
	fontLoaded,
	installTauriShim,
} from "./support/app";

const TAB_LABEL = '[data-slot="navbar-tab-label"]';
const NAVBAR_ITEMS = 5;

test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 });

async function openNavbar({
	page,
	query = "",
}: {
	page: Page;
	query?: string;
}): Promise<Locator> {
	await installTauriShim(page);
	await page.goto(`/right-now${query}`);
	const navbar = page.getByRole("navigation");
	const items = navbar.getByRole("link");
	await expect(items).toHaveCount(NAVBAR_ITEMS, {
		timeout: FIRST_ROUTE_COMPILE_MS,
	});
	for (const item of await items.all()) await fontLoaded(item);
	return navbar;
}

function measure(navbar: Locator) {
	return navbar.evaluate(
		(element, labelSelector) => ({
			viewportWidth: window.innerWidth,
			physicalWidth: window.innerWidth * window.devicePixelRatio,
			pageOverflow:
				document.documentElement.scrollWidth -
				document.documentElement.clientWidth,
			items: [...element.querySelectorAll("a")].map((item) => {
				const { left, right } = item.getBoundingClientRect();
				return { left, right };
			}),
			labels: [...element.querySelectorAll(labelSelector)].map(
				(label) => ({
					cut: label.scrollWidth > label.clientWidth,
					ellipsis:
						getComputedStyle(label).textOverflow === "ellipsis",
				}),
			),
		}),
		TAB_LABEL,
	);
}

type Layout = Awaited<ReturnType<typeof measure>>;

function expectEveryItemOnScreen(layout: Layout): void {
	expect(layout.pageOverflow).toBeLessThanOrEqual(0);
	expect(layout.items).toHaveLength(NAVBAR_ITEMS);
	for (const { left, right } of layout.items) {
		expect(left).toBeGreaterThanOrEqual(0);
		expect(right).toBeLessThanOrEqual(layout.viewportWidth);
	}
}

function cutLabels(layout: Layout): Layout["labels"] {
	expect(layout.labels).toHaveLength(NAVBAR_ITEMS - 1);
	return layout.labels.filter(({ cut }) => cut);
}

function expectCutLabelsToEndInEllipsis(layout: Layout): void {
	const cut = cutLabels(layout);
	expect(cut.length).toBeGreaterThan(0);
	expect(cut).not.toContainEqual({ cut: true, ellipsis: false });
}

test("the bottom navbar fits a 1080px physical-width screen without cutting a label", async ({
	page,
}) => {
	const navbar = await openNavbar({ page });
	const layout = await measure(navbar);

	expect(layout.physicalWidth).toBe(1080);
	expectEveryItemOnScreen(layout);
	expect(cutLabels(layout)).toEqual([]);
});

for (const width of [412, 1280]) {
	test.describe(`in a ${width} px wide window`, () => {
		test.use({ viewport: { width, height: 800 } });

		test("the bottom navbar cuts no English label", async ({ page }) => {
			const navbar = await openNavbar({ page });
			const layout = await measure(navbar);

			expectEveryItemOnScreen(layout);
			expect(cutLabels(layout)).toEqual([]);
		});
	});
}

test("tab widths don't change when selecting a tab", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/right-now");

	const navbar = page.getByRole("navigation", { name: "Main" });
	const tabs = ["Browse", "Right Now", "Interest", "Inbox"].map((name) =>
		navbar.getByRole("link", { name }),
	);
	for (const tab of tabs) await fontLoaded(tab);

	const getWidths = () =>
		Promise.all(
			tabs.map((tab) =>
				tab.evaluate((el) => el.getBoundingClientRect().width),
			),
		);

	const initialWidths = await getWidths();

	for (const tab of tabs) {
		await tab.click();
		await expect(tab).toHaveAttribute("data-active", "true");
		const widths = await getWidths();
		expect(widths).toEqual(initialWidths);
	}
});

test.describe("in a 308 × 404 pop-up window", () => {
	test.use({ viewport: { width: 308, height: 404 } });

	test("the bottom navbar keeps every tab and Me on screen and cuts labels with an ellipsis", async ({
		page,
	}) => {
		const navbar = await openNavbar({ page });
		const layout = await measure(navbar);

		expectEveryItemOnScreen(layout);
		expectCutLabelsToEndInEllipsis(layout);
	});
});

test.describe("under the en-XA pseudo-locale", () => {
	test.use({ baseURL: DEV_SERVER_URL });

	for (const width of [412, 360, 320]) {
		test.describe(`on a ${width} px wide screen`, () => {
			test.use({ viewport: { width, height: 800 } });

			test("the bottom navbar keeps every tab and Me on screen and cuts labels with an ellipsis", async ({
				page,
			}) => {
				const navbar = await openNavbar({
					page,
					query: "?locale=en-XA",
				});
				const layout = await measure(navbar);

				expectEveryItemOnScreen(layout);
				expectCutLabelsToEndInEllipsis(layout);
			});
		});
	}
});

test.describe("on a 412 × 920 phone with 64 px system bars", () => {
	test.use({ viewport: { width: 412, height: 920 } });

	test("the Me screen fits without scrolling", async ({ page }) => {
		await installTauriShim(page);
		await page.goto("/settings");
		const scroller = page.locator('[data-slot="me-scroller"]');
		await expect(
			scroller.getByRole("button", { name: "Sign out" }),
		).toBeVisible();
		await page.waitForLoadState("networkidle");

		expect(
			await scroller.evaluate((el) => el.scrollHeight - el.clientHeight),
		).toBeLessThanOrEqual(0);
	});
});

test.describe("on a 360 × 640 phone with 64 px system bars", () => {
	test.use({ viewport: { width: 360, height: 640 } });

	test("the Me screen's version label ends no closer to the navbar than to the link above it", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto("/settings");
		const scroller = page.locator('[data-slot="me-scroller"]');
		await expect(
			scroller.getByRole("button", { name: "Sign out" }),
		).toBeVisible();
		await page.waitForLoadState("networkidle");

		const gaps = await scroller.evaluate((scrollerElement) => {
			const version = scrollerElement.querySelector(
				'[data-slot="me-version"]',
			);
			const linkAbove = version?.previousElementSibling;
			const meTab = document.querySelector(
				'nav[aria-label="Main"] a[aria-label="Me"]',
			);
			if (!version || !linkAbove || !meTab)
				throw new Error("Me screen structure not found");

			const contentBounds = (element: Element) => {
				const range = document.createRange();
				range.selectNodeContents(element);
				return range.getBoundingClientRect();
			};

			scrollerElement.scrollTop = scrollerElement.scrollHeight;
			const versionText = contentBounds(version);
			return {
				scrollRange:
					scrollerElement.scrollHeight - scrollerElement.clientHeight,
				aboveVersion: versionText.top - contentBounds(linkAbove).bottom,
				belowVersion:
					meTab.getBoundingClientRect().top - versionText.bottom,
			};
		});

		expect(gaps.scrollRange).toBeGreaterThan(0);
		expect(gaps.aboveVersion).toBeGreaterThan(0);
		expect(gaps.belowVersion).toBeGreaterThanOrEqual(gaps.aboveVersion);
	});
});
