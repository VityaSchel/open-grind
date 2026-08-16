import { expect, type Page, test } from "@playwright/test";

import { installTauriShim, TrustedTouch } from "./support/app";

const CONVERSATION = "/chat/100001:123456000";
const MESSAGE_ROW = '[role="button"][tabindex="0"]';
const REACTABLE = "Sed do eiusmod tempor incididunt?";
const REACT_BUTTON = { name: "React with fire" };
const HINT = "Double tap to";
const CHIP = 'img[alt="Fire reaction"]';

async function openConversation(page: Page) {
	await installTauriShim(page);
	await page.goto(CONVERSATION);
	await page.locator(MESSAGE_ROW).first().waitFor({ timeout: 60_000 });
}

function reactable(page: Page) {
	return page.locator(MESSAGE_ROW).filter({ hasText: REACTABLE });
}

test.describe("with a cursor", () => {
	// the shared context emulates a touchscreen, where the button never shows
	test.use({ hasTouch: false });

	test("the menu offers the reaction as a button, since no finger can double-tap", async ({
		page,
	}) => {
		await openConversation(page);
		await reactable(page).click({ button: "right" });

		const react = page.getByRole("button", REACT_BUTTON);
		await expect(react).toBeVisible();
		await expect(page.getByText(HINT)).toBeHidden();

		await react.click();

		await expect(page.getByRole("button", REACT_BUTTON)).toBeHidden();
		await expect(reactable(page).locator(CHIP)).toBeVisible();
	});

	test("our own message offers no reaction, in the menu or otherwise", async ({
		page,
	}) => {
		await openConversation(page);
		await page.getByRole("textbox").fill("nobody reacts to this");
		await page.getByRole("textbox").press("Enter");
		const own = page
			.locator(MESSAGE_ROW)
			.filter({ hasText: "nobody reacts to this" });
		await expect(own).toBeVisible();

		await own.click({ button: "right" });

		await expect(page.getByRole("button", { name: "Reply" })).toBeVisible();
		await expect(page.getByRole("button", REACT_BUTTON)).toHaveCount(0);
		await expect(page.getByText(HINT)).toBeHidden();
	});
});

test("a touchscreen keeps the double-tap hint instead of the button", async ({
	page,
}) => {
	await openConversation(page);
	await reactable(page).click({ button: "right" });

	await expect(page.getByText(HINT)).toBeVisible();
	await expect(page.getByRole("button", REACT_BUTTON)).toBeHidden();
});

test("a double tap still reacts on a touchscreen", async ({ page }) => {
	await openConversation(page);
	const bubble = reactable(page);
	const box = await bubble.boundingBox();
	if (!box) throw new Error("the reactable row has no box");

	const touch = await TrustedTouch.attach(page);
	const x = box.x + 40;
	const y = box.y + box.height / 2;
	await touch.start(x, y);
	await touch.end();
	await page.waitForTimeout(80);
	await touch.start(x, y);
	await touch.end();

	await expect(bubble.locator(CHIP)).toBeVisible();
	await expect(page.getByLabel("Cancel reply")).toHaveCount(0);
});
