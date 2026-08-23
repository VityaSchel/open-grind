import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const FAVORITE_PROFILE = "/profile/100013";
const LONG_NOTE =
	"Met at the coffee place on 3rd. ".repeat(12) +
	"Wants to go back again in spring.";
const VIEWPORT_WITH_SOFT_KEYBOARD = { width: 420, height: 420 };

function forceScrollRoot(page: Page) {
	return page.evaluate(() => {
		const drawer =
			document.querySelector<HTMLElement>("[data-vaul-drawer]")!;
		drawer.scrollTop = 9999;
		return drawer.scrollTop;
	});
}

async function openNoteEditor(page: Page) {
	await installTauriShim(page);
	await page.goto(FAVORITE_PROFILE);
	const trigger = page.getByRole("button", { name: /note/i }).first();
	await trigger.waitFor({ timeout: 60_000 });
	await trigger.click();
	await page.locator("[data-vaul-drawer]").waitFor({ timeout: 10_000 });
	await page.waitForTimeout(700);
}

function metrics(page: Page) {
	return page.evaluate(() => {
		const drawer =
			document.querySelector<HTMLElement>("[data-vaul-drawer]");
		if (!drawer) return null;
		const body = drawer.querySelector<HTMLElement>(
			"[data-slot=drawer-body]",
		);
		const footer = drawer.querySelector<HTMLElement>(
			"[data-slot=drawer-footer]",
		);
		const save = [...drawer.querySelectorAll("button")].find(
			(button) => button.textContent?.trim() === "Save",
		);
		const rect = drawer.getBoundingClientRect();
		return {
			top: Math.round(rect.top),
			height: Math.round(rect.height),
			scrollHeight: drawer.scrollHeight,
			clientHeight: drawer.clientHeight,
			overflowY: getComputedStyle(drawer).overflowY,
			body: body && {
				scrollHeight: body.scrollHeight,
				clientHeight: body.clientHeight,
				scrollable: body.scrollHeight > body.clientHeight + 1,
				bottom: Math.round(body.getBoundingClientRect().bottom),
			},
			footerTop: footer
				? Math.round(footer.getBoundingClientRect().top)
				: null,
			saveBottom: save
				? Math.round(save.getBoundingClientRect().bottom)
				: null,
			viewport: window.innerHeight,
		};
	});
}

test.describe("drawer overflow", () => {
	test("a note taller than the screen scrolls its body, not the card", async ({
		page,
	}) => {
		await openNoteEditor(page);
		await page.locator("[data-slot=textarea]").fill(LONG_NOTE);
		await page.setViewportSize(VIEWPORT_WITH_SOFT_KEYBOARD);
		await page.waitForTimeout(400);

		const before = await metrics(page);
		expect(before).not.toBeNull();

		expect(before!.overflowY, "the root is not a scroll container").toBe(
			"visible",
		);
		expect(
			before!.scrollHeight,
			"vaul's absolute 200%-tall ::after still inflates scrollHeight",
		).toBeGreaterThan(before!.clientHeight);
		expect(
			await forceScrollRoot(page),
			"yet the root refuses to scroll, so the card cannot slide away",
		).toBe(0);

		expect(before!.height).toBeLessThanOrEqual(before!.viewport);
		expect(before!.body, "the drawer has a body").not.toBeNull();
		expect(before!.body!.scrollable, "the body scrolls").toBe(true);
		expect(before!.saveBottom!).toBeLessThanOrEqual(before!.viewport);
		expect(before!.footerTop!).toBeGreaterThanOrEqual(
			before!.body!.bottom - 2,
		);

		await page.evaluate(() => {
			document.querySelector("[data-slot=drawer-body]")!.scrollTop = 9999;
		});
		await page.waitForTimeout(300);

		const after = await metrics(page);
		expect(after!.top, "the card stayed put").toBe(before!.top);
		expect(after!.saveBottom, "Save stayed pinned").toBe(
			before!.saveBottom,
		);
	});

	test("a short note leaves the drawer hugging its content", async ({
		page,
	}) => {
		await openNoteEditor(page);
		const m = await metrics(page);
		expect(m!.body!.scrollable, "nothing to scroll when it fits").toBe(
			false,
		);
		expect(m!.height, "the drawer is shorter than the screen").toBeLessThan(
			m!.viewport,
		);
	});
});
