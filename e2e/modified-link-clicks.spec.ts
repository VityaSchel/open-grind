import { expect, type Locator, type Page, test } from "@playwright/test";

import { historyDepth, meTab } from "./support/app";
import { openTaps } from "./support/interest-pager";

const SETTINGS_URL = /\/settings$/;

const GESTURES: { name: string; click: Parameters<Locator["click"]>[0] }[] = [
	{ name: "Shift-click", click: { modifiers: ["Shift"] } },
	{ name: "Alt-click", click: { modifiers: ["Alt"] } },
	{ name: "Meta-click", click: { modifiers: ["Meta"] } },
	{ name: "Middle-click", click: { button: "middle" } },
];

test.describe.configure({ timeout: 300_000 });

function watchForEscapes(page: Page): string[] {
	const escapes: string[] = [];
	page.context().on("page", (opened) => {
		escapes.push(`a second page at ${opened.url()}`);
	});
	page.on("download", (download) => {
		escapes.push(`a download of ${download.url()}`);
	});
	return escapes;
}

const documentBirth = (page: Page) =>
	page.evaluate(() => performance.timeOrigin);

for (const gesture of GESTURES) {
	test(`${gesture.name} on a nav tab navigates inside the running app`, async ({
		page,
	}) => {
		await openTaps(page);
		const escapes = watchForEscapes(page);
		const born = await documentBirth(page);

		await meTab(page).click(gesture.click);

		await expect(page).toHaveURL(SETTINGS_URL);
		expect(
			await documentBirth(page),
			"the app was loaded again instead of routed",
		).toBe(born);
		expect(escapes).toEqual([]);
	});
}

test("Shift-click on an interest tab still replaces the history entry", async ({
	page,
}) => {
	await openTaps(page);
	const atTaps = await historyDepth(page);

	await page
		.getByRole("link", { name: "Views" })
		.click({ modifiers: ["Shift"] });

	await expect(page).toHaveURL(/\/interest\/views$/);
	expect(await historyDepth(page)).toBe(atTaps);
});

test("Control-click navigates inside the app where it is not the secondary click", async ({
	page,
}) => {
	await openTaps(page, { platform: "linux" });
	const escapes = watchForEscapes(page);
	const born = await documentBirth(page);

	await meTab(page).dispatchEvent("click", { ctrlKey: true, detail: 1 });

	await expect(page).toHaveURL(SETTINGS_URL);
	expect(
		await documentBirth(page),
		"the app was loaded again instead of routed",
	).toBe(born);
	expect(escapes).toEqual([]);
});

test("Control-click on macOS, the secondary click, never follows the link", async ({
	page,
}) => {
	await openTaps(page, { platform: "macos" });

	const outcome = await meTab(page).evaluate((link) => {
		let reachedTheApp = 0;
		const count = () => reachedTheApp++;
		document.addEventListener("click", count);
		const followed = link.dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				composed: true,
				ctrlKey: true,
				detail: 1,
			}),
		);
		document.removeEventListener("click", count);
		return { followed, reachedTheApp };
	});

	expect(outcome).toEqual({ followed: false, reachedTheApp: 0 });
});
