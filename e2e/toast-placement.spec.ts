import { expect, type Locator, type Page, test } from "@playwright/test";

import { SHARED_ALBUM_ID } from "./support/albums";
import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const ERROR_TOAST_MODULE_URL = "/src/lib/api/error-toast.ts";
const TOAST_LABEL = "Placement probe";
const TOAST_GAP_PX = 8;
const WIDE_VIEWPORT = { width: 1024, height: 800 };
const RAISED_BOTTOM_INSET_PX = 120;

const frontToast = (page: Page) =>
	page.locator('[data-sonner-toast][data-front="true"]', {
		hasText: TOAST_LABEL,
	});
const navBarAvatar = (page: Page) =>
	page.getByRole("link", { name: "Me", exact: true });
const composer = (page: Page) => page.locator('[data-slot="message-composer"]');
const profileActionBar = (page: Page) =>
	page
		.getByRole("navigation")
		.filter({
			has: page.getByRole("link", { name: "Write a message..." }),
		});

const saveButton = (page: Page) =>
	page.getByRole("button", { name: "Save changes" });

const profileDisplayName = (page: Page) =>
	page.getByRole("textbox", { name: "Display name" });

async function makeDirty(field: Locator): Promise<void> {
	await field.waitFor({ timeout: 60_000 });
	const saveBarShown = field
		.page()
		.evaluate(
			() =>
				new Promise<void>((shown) =>
					document.addEventListener("introend", () => shown(), {
						capture: true,
						once: true,
					}),
				),
		);
	await field.fill("Renamed in a test");
	await saveBarShown;
}

async function scrollSettingsToEnd(page: Page): Promise<void> {
	await page.locator('[data-slot="subpage-scroller"]').evaluate(
		(scroller) =>
			new Promise((settled) => {
				scroller.scrollTop = scroller.scrollHeight;
				requestAnimationFrame(() => requestAnimationFrame(settled));
			}),
	);
}

async function bottomToasterOffset(page: Page): Promise<string> {
	return page
		.locator('[data-sonner-toaster][data-y-position="bottom"]')
		.evaluate((toaster) => getComputedStyle(toaster).bottom);
}

async function expectToastGapAbove(obstruction: Locator): Promise<void> {
	const page = obstruction.page();
	await obstruction.waitFor({ timeout: 60_000 });
	await page.evaluate(
		async ({ module, label }) => {
			const { showErrorToast } = await import(module);
			showErrorToast({ label, error: new Error(label) });
		},
		{ module: ERROR_TOAST_MODULE_URL, label: TOAST_LABEL },
	);
	const toast = frontToast(page);
	await expect(toast).toHaveAttribute("data-mounted", "true");
	await toast.evaluate((element) =>
		Promise.all(element.getAnimations().map(({ finished }) => finished)),
	);
	const toastBox = await toast.boundingBox();
	const obstructionBox = await obstruction.boundingBox();
	if (!toastBox || !obstructionBox) throw new Error("Nothing to measure");
	expect(obstructionBox.y - (toastBox.y + toastBox.height)).toBeCloseTo(
		TOAST_GAP_PX,
		0,
	);
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test.describe("a toast rests 8px above the bottom chrome", () => {
	test("on the browse grid", async ({ page }) => {
		await page.goto("/");
		await expectToastGapAbove(navBarAvatar(page));
	});

	test("on the inbox", async ({ page }) => {
		await page.goto("/chat");
		await expectToastGapAbove(navBarAvatar(page));
	});

	test("in a conversation on a phone after the nav bar leaves", async ({
		page,
	}) => {
		await page.goto("/chat");
		await navBarAvatar(page).waitFor({ timeout: 60_000 });
		await page.locator(`a[href="${DEMO_CONVERSATION}"]`).first().click();
		await expect(navBarAvatar(page)).toHaveCount(0);
		await expectToastGapAbove(composer(page));
	});

	test("in a conversation on a phone after the bottom inset changes", async ({
		page,
	}) => {
		await page.goto(DEMO_CONVERSATION);
		await composer(page).waitFor({ timeout: 60_000 });
		await page.evaluate((bottom) => {
			const insets = window.__AndroidInsets;
			if (!insets) throw new Error("Test insets are off");
			insets.bottom = () => bottom;
			window.__reapplyInsets();
		}, RAISED_BOTTOM_INSET_PX);
		await expectToastGapAbove(composer(page));
	});

	test("beside a conversation on a wide screen", async ({ page }) => {
		await page.setViewportSize(WIDE_VIEWPORT);
		await page.goto(DEMO_CONVERSATION);
		await composer(page).waitFor({ timeout: 60_000 });
		await expectToastGapAbove(navBarAvatar(page));
	});

	test("on another user's profile", async ({ page }) => {
		await page.goto("/profile/100001");
		await expectToastGapAbove(profileActionBar(page));
	});

	test("while editing the profile, before and after scrolling to the end", async ({
		page,
	}) => {
		await page.goto("/settings/profile");
		await makeDirty(profileDisplayName(page));
		const save = saveButton(page);
		await expectToastGapAbove(save);

		const stuck = await save.boundingBox();
		await scrollSettingsToEnd(page);
		const unstuck = await save.boundingBox();
		expect(unstuck?.y).toBeLessThan(stuck?.y ?? 0);
		await expectToastGapAbove(save);
	});

	test("while editing an album", async ({ page }) => {
		await page.goto(`/albums/${SHARED_ALBUM_ID}`);
		await makeDirty(page.getByRole("textbox", { name: "Album name" }));
		await expectToastGapAbove(saveButton(page));
	});
});

test("the save confirmation stays put while the save bar flies away", async ({
	page,
}) => {
	await page.goto("/settings/profile");
	await makeDirty(profileDisplayName(page));
	await scrollSettingsToEnd(page);
	const scrolledMidFlight = page.evaluate(async () => {
		const nextFrame = () =>
			new Promise((framed) => requestAnimationFrame(framed));
		const saveBar = await new Promise<EventTarget | null>((leaving) =>
			document.addEventListener(
				"outrostart",
				({ target }) => leaving(target),
				{ capture: true, once: true },
			),
		);
		await nextFrame();
		document
			.querySelector('[data-slot="subpage-scroller"]')
			?.dispatchEvent(new Event("scroll"));
		await nextFrame();
		const toaster = document.querySelector(
			'[data-sonner-toaster][data-y-position="bottom"]',
		);
		return {
			bottom: toaster && getComputedStyle(toaster).bottom,
			saveBarFlying: saveBar instanceof Element && saveBar.isConnected,
		};
	});
	await saveButton(page).click();

	const { bottom, saveBarFlying } = await scrolledMidFlight;
	expect(saveBarFlying).toBe(true);
	await expect(saveButton(page)).toHaveCount(0);
	expect(await bottomToasterOffset(page)).toBe(bottom);
	await expectToastGapAbove(navBarAvatar(page));
});
