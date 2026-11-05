import { expect, type Page, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import {
	CLASSIC_SCROLLBARS,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	TrustedTouch,
} from "./support/app";
import { activeProfilePane } from "./support/profile-pager";

test.use({
	baseURL: DEV_SERVER_URL,
	viewport: { width: 1200, height: 800 },
	...CLASSIC_SCROLLBARS,
});

const DEMO_PROFILE = "/profile/100001";
const PHOTO_ROW = '[data-slot="profile-photo-row"]';
const SCROLLER = '[data-slot="profile-scroller"]';
const STRIP_INSET_PX = 4;
const PULL_PX = 200;
const REFRESH_SETTLE_MS = 2400;
const ROLL_PX = 5;
const BROWSER_CLICK_SETTLE_MS = 500;

async function openProfile(page: Page) {
	test.setTimeout(FIRST_ROUTE_COMPILE_MS + 60_000);
	await installTauriShim(page, { platform: "android" });
	await page.goto(DEMO_PROFILE);
	const pane = activeProfilePane(page);
	await pane
		.getByRole("button", { name: "Profile menu" })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await pane.locator("[data-refresh-phase]").waitFor({ state: "attached" });
	return pane;
}

test("the photo row reaches across the scroller beside the photos, so a pull there neither refreshes nor scrolls", async ({
	page,
}) => {
	const pane = await openProfile(page);
	const scroller = pane.locator(SCROLLER);

	const layout = await scroller.evaluate(
		(el: HTMLElement, { rowSelector, insetPx }) => {
			const row = el.querySelector(rowSelector)!;
			const rowBox = row.getBoundingClientRect();
			const box = el.getBoundingClientRect();
			const hitArea = getComputedStyle(row, "::before");
			const y = rowBox.top + rowBox.height / 2;
			const hitsRow = (x: number) =>
				document.elementFromPoint(x, y)?.closest(rowSelector) === row;
			return {
				scrollbarPx: el.offsetWidth - el.clientWidth,
				overflowPx: el.scrollWidth - el.clientWidth,
				photosLeft: rowBox.left,
				photosRight: rowBox.right,
				contentLeft: box.left,
				contentRight: box.left + el.clientWidth,
				hitAreaLeft: rowBox.left + parseFloat(hitArea.left),
				hitAreaWidth: parseFloat(hitArea.width),
				hitsLeftStrip: hitsRow(box.left + insetPx),
				hitsRightStrip: hitsRow(box.left + el.clientWidth - insetPx),
				strip: { x: box.left + insetPx, y },
			};
		},
		{ rowSelector: PHOTO_ROW, insetPx: STRIP_INSET_PX },
	);
	expect(layout.scrollbarPx).toBeGreaterThan(0);
	expect(layout.photosLeft).toBeGreaterThan(layout.contentLeft);
	expect(layout.photosRight).toBeLessThan(layout.contentRight);
	expect(layout.overflowPx).toBe(0);
	expect(layout.hitAreaLeft).toBeCloseTo(layout.contentLeft, 0);
	expect(layout.hitAreaWidth).toBeCloseTo(
		layout.contentRight - layout.contentLeft,
		0,
	);
	expect(layout.hitsLeftStrip).toBe(true);
	expect(layout.hitsRightStrip).toBe(true);

	const phases = await pane
		.locator("[data-refresh-phase]")
		.evaluateHandle((overlay: HTMLElement) => {
			const seen = new Set([overlay.dataset.refreshPhase]);
			new MutationObserver(() =>
				seen.add(overlay.dataset.refreshPhase),
			).observe(overlay, {
				attributes: true,
				attributeFilter: ["data-refresh-phase"],
			});
			return seen;
		});
	const touch = await TrustedTouch.attach(page);
	await touch.drag(page, layout.strip, {
		x: layout.strip.x,
		y: layout.strip.y + PULL_PX,
	});
	await page.waitForTimeout(REFRESH_SETTLE_MS);

	expect(await phases.evaluate((seen) => [...seen])).toEqual(["idle"]);
	expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
});

test("a tap on the note that rolls a few pixels down still opens the note editor, once", async ({
	page,
}) => {
	const pane = await openProfile(page);
	const note = pane.getByRole("button", { name: "Add note" });
	const clicks = await note.evaluateHandle((button) => {
		const seen = { count: 0 };
		button.addEventListener("click", () => (seen.count += 1));
		return seen;
	});
	const box = await note.boundingBox();
	if (!box) throw new Error("the note button is not on screen");
	const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		center,
		{ x: center.x, y: center.y + ROLL_PX },
		{ steps: 3 },
	);

	await expect(page.getByRole("dialog")).toBeVisible();
	await page.waitForTimeout(BROWSER_CLICK_SETTLE_MS);
	expect(await clicks.evaluate((seen) => seen.count)).toBe(1);
});
