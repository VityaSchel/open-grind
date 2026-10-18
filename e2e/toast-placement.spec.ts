import { expect, type Locator, type Page, test } from "@playwright/test";

import { SHARED_ALBUM_ID } from "./support/albums";
import {
	backLink,
	DEMO_CONVERSATION,
	installTauriShim,
	meTab,
} from "./support/app";
import { setBlurMode } from "./support/layout-guard";
import {
	BOTTOM_TOASTER,
	bottomToaster,
	showRestingToast,
	TOAST_GAP_PX,
	type ToastEdge,
	toastGap,
} from "./support/toast";

const TOAST_LABEL = "Placement probe";
const LOW_BAR_GAP_PX = 12;
const WIDE_VIEWPORT = { width: 1024, height: 800 };
const RAISED_BOTTOM_INSET_PX = 120;

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
	return bottomToaster(page).evaluate(
		(toaster) => getComputedStyle(toaster).bottom,
	);
}

async function expectToastGap({
	obstruction,
	edge,
	expectedGap = TOAST_GAP_PX,
}: {
	obstruction: Locator;
	edge: ToastEdge;
	expectedGap?: number;
}): Promise<void> {
	const page = obstruction.page();
	await obstruction.waitFor({ timeout: 60_000 });
	const toast = await showRestingToast({ page, edge, label: TOAST_LABEL });
	expect(await toastGap({ toast, obstruction, edge })).toBeCloseTo(
		expectedGap,
		0,
	);
}

async function useLowBlur(page: Page): Promise<void> {
	await expect(page.locator("html")).toHaveAttribute(
		"data-backdrop-blur",
		"max",
		{ timeout: 60_000 },
	);
	await setBlurMode(page, "min");
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

test.describe("a top toast rests 8px below the top chrome", () => {
	test("on an app settings page", async ({ page }) => {
		await page.goto("/settings/app");
		await expectToastGap({ obstruction: backLink(page), edge: "top" });
	});

	test("on another user's profile", async ({ page }) => {
		await page.goto("/profile/100001");
		await expectToastGap({ obstruction: backLink(page), edge: "top" });
	});
});

test.describe("a toast rests 8px above the bottom chrome", () => {
	test("on the browse grid", async ({ page }) => {
		await page.goto("/");
		await expectToastGap({ obstruction: meTab(page), edge: "bottom" });
	});

	test("on the inbox", async ({ page }) => {
		await page.goto("/chat");
		await expectToastGap({ obstruction: meTab(page), edge: "bottom" });
	});

	test("in a conversation on a phone after the nav bar leaves", async ({
		page,
	}) => {
		await page.goto("/chat");
		await meTab(page).waitFor({ timeout: 60_000 });
		await page.locator(`a[href="${DEMO_CONVERSATION}"]`).first().click();
		await expect(meTab(page)).toHaveCount(0);
		await expectToastGap({ obstruction: composer(page), edge: "bottom" });
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
		await expectToastGap({ obstruction: composer(page), edge: "bottom" });
	});

	test("beside a conversation on a wide screen", async ({ page }) => {
		await page.setViewportSize(WIDE_VIEWPORT);
		await page.goto(DEMO_CONVERSATION);
		await composer(page).waitFor({ timeout: 60_000 });
		await expectToastGap({ obstruction: meTab(page), edge: "bottom" });
	});

	test("on another user's profile", async ({ page }) => {
		await page.goto("/profile/100001");
		await expectToastGap({
			obstruction: profileActionBar(page),
			edge: "bottom",
		});
	});

	test("while editing the profile, before and after scrolling to the end", async ({
		page,
	}) => {
		await page.goto("/settings/profile");
		await makeDirty(profileDisplayName(page));
		const save = saveButton(page);
		await expectToastGap({ obstruction: save, edge: "bottom" });

		const stuck = await save.boundingBox();
		await scrollSettingsToEnd(page);
		const unstuck = await save.boundingBox();
		expect(
			Math.abs((unstuck?.y ?? 0) - (stuck?.y ?? 0)),
		).toBeLessThanOrEqual(1);
		await expectToastGap({ obstruction: save, edge: "bottom" });
	});

	test("while editing an album", async ({ page }) => {
		await page.goto(`/settings/albums/${SHARED_ALBUM_ID}`);
		await makeDirty(page.getByRole("textbox", { name: "Album name" }));
		await expectToastGap({ obstruction: saveButton(page), edge: "bottom" });
	});
});

test.describe("in Low blur, a toast keeps the bar gap", () => {
	test("above the bottom chrome on the browse grid", async ({ page }) => {
		await page.goto("/");
		await useLowBlur(page);
		await expectToastGap({
			obstruction: meTab(page),
			edge: "bottom",
			expectedGap: TOAST_GAP_PX + LOW_BAR_GAP_PX,
		});
	});

	test("only against bars, not against the composer", async ({ page }) => {
		await page.goto(DEMO_CONVERSATION);
		await composer(page).waitFor({ timeout: 60_000 });
		await useLowBlur(page);
		await expectToastGap({ obstruction: composer(page), edge: "bottom" });
	});

	test("only against bars, not below a profile's back link", async ({
		page,
	}) => {
		await page.goto("/profile/100001");
		await useLowBlur(page);
		await expectToastGap({ obstruction: backLink(page), edge: "top" });
	});

	test("below the Interest bar", async ({ page }) => {
		await page.goto("/interest/taps");
		await useLowBlur(page);
		await expectToastGap({
			obstruction: page.getByRole("navigation", { name: "Interest" }),
			edge: "top",
			expectedGap: LOW_BAR_GAP_PX,
		});
	});
});

test("the save confirmation glides once to its resting place while the save bar flies away", async ({
	page,
}) => {
	await page.goto("/settings/profile");
	await makeDirty(profileDisplayName(page));
	await scrollSettingsToEnd(page);
	const flight = page.evaluate(async (toasterSelector) => {
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
		const saveBarFlying = saveBar instanceof Element && saveBar.isConnected;
		const bottoms: number[] = [];
		const started = performance.now();
		while (performance.now() - started < 600) {
			await nextFrame();
			const toaster = document.querySelector(toasterSelector);
			if (toaster)
				bottoms.push(
					Number.parseFloat(getComputedStyle(toaster).bottom),
				);
		}
		return { bottoms, saveBarFlying };
	}, BOTTOM_TOASTER);
	await saveButton(page).click();

	const { bottoms, saveBarFlying } = await flight;
	expect(saveBarFlying).toBe(true);
	await expect(saveButton(page)).toHaveCount(0);
	const resting = Number.parseFloat(await bottomToasterOffset(page));
	expect(bottoms.length).toBeGreaterThan(0);
	expect(
		Math.min(...bottoms),
		"the toast never dips below its resting place",
	).toBeGreaterThanOrEqual(resting - 0.5);
	for (const [index, bottom] of bottoms.entries())
		expect(bottom, "the toast only glides down").toBeLessThanOrEqual(
			(bottoms[index - 1] ?? bottom) + 0.5,
		);
	await expectToastGap({ obstruction: meTab(page), edge: "bottom" });
});
