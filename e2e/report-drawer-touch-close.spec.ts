import { expect, type Locator, type Page, test } from "@playwright/test";

import { installTauriShim, TrustedTouch } from "./support/app";
import { DRAWER } from "./support/drawer";

const DEMO_PROFILE = "/profile/100001";
const REASON = "Spam";
const BELOW_FLICK_SPEED = { steps: 24, holdMs: 40, release: false };
const DRAG_PX = 240;
const FOLLOWED_PX = 150;

async function openReportSheet(page: Page): Promise<Locator> {
	await installTauriShim(page);
	await page.goto(DEMO_PROFILE);
	await page.getByLabel("Profile menu").click();
	await page.getByRole("menuitem", { name: "Report profile" }).click();
	const drawer = page.locator(DRAWER);
	await drawer.waitFor({ timeout: 10_000 });
	await page.waitForTimeout(700);
	await expect(
		drawer.getByRole("heading", { name: "Report profile" }),
	).toBeVisible();
	return drawer;
}

async function layoutBox(target: Locator) {
	const box = await target.boundingBox();
	if (box === null) throw new Error("the element is not laid out");
	return box;
}

test.beforeEach(() => {
	test.setTimeout(240_000);
});

test("a slow drag down that starts on a reason follows the finger and closes the report sheet", async ({
	page,
}) => {
	const drawer = await openReportSheet(page);
	const reason = await layoutBox(drawer.getByRole("radio", { name: REASON }));
	const touch = await TrustedTouch.attach(page);
	const start = await layoutBox(drawer);
	const from = {
		x: reason.x + reason.width / 2,
		y: reason.y + reason.height / 2,
	};

	await touch.drag(
		page,
		from,
		{ x: from.x, y: from.y + DRAG_PX },
		BELOW_FLICK_SPEED,
	);
	expect(
		(await layoutBox(drawer)).y - start.y,
		"the sheet is still under the finger",
	).toBeGreaterThan(FOLLOWED_PX);

	await touch.end();
	await expect(page.locator(DRAWER)).toHaveCount(0);
});

test("a tap on a reason still picks it", async ({ page }) => {
	const drawer = await openReportSheet(page);
	const reason = drawer.getByRole("radio", { name: REASON });
	await expect(reason).not.toBeChecked();

	await reason.tap();

	await expect(reason).toBeChecked();
	await expect(
		drawer.getByRole("button", { name: "Submit report" }),
	).toBeEnabled();
});
