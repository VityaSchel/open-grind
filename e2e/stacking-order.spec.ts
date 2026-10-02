import { expect, type Locator, type Page, test } from "@playwright/test";

import { SHARED_ALBUM_ID } from "./support/albums";
import { animationsFinished, installTauriShim } from "./support/app";
import { DRAWER } from "./support/drawer";
import { showRestingToast } from "./support/toast";

const DEMO_PROFILE = "/profile/100001";
const SHARED_ALBUM = `/settings/albums/${SHARED_ALBUM_ID}`;
const TOAST_LABEL = "Stacking probe";
const MENUS_REACHING_A_TOAST = [
	{ trigger: "Profile menu", url: DEMO_PROFILE, edge: "bottom" },
	{ trigger: "Album menu", url: SHARED_ALBUM, edge: "top" },
] as const;
const MENU = '[data-slot="dropdown-menu-content"]';
const TOAST = "[data-sonner-toast]";
const TOASTER = "[data-sonner-toaster]";
const SAFE_AREA_STRIP = '[data-slot="safe-area-strip"]';

interface Area {
	x: number;
	y: number;
	width: number;
	height: number;
}

async function openMenu({
	page,
	trigger,
}: {
	page: Page;
	trigger: string;
}): Promise<Locator> {
	await page.getByRole("button", { name: trigger }).click();
	const menu = page.locator(MENU);
	await menu.waitFor();
	await animationsFinished(menu);
	return menu;
}

async function overlap({
	first,
	second,
}: {
	first: Locator;
	second: Locator;
}): Promise<Area> {
	const [a, b] = await Promise.all([
		first.boundingBox(),
		second.boundingBox(),
	]);
	if (!a || !b) throw new Error("Nothing to measure");
	const left = Math.max(a.x, b.x);
	const right = Math.min(a.x + a.width, b.x + b.width);
	const top = Math.max(a.y, b.y);
	const bottom = Math.min(a.y + a.height, b.y + b.height);
	expect(right - left, "the layers share some width").toBeGreaterThan(0);
	expect(bottom - top, "the layers share some height").toBeGreaterThan(0);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

function frontLayerIn({
	page,
	area,
	layers,
}: {
	page: Page;
	area: Area;
	layers: string[];
}): Promise<string | undefined> {
	return page.evaluate(
		({ x, y, width, height, selectors }) => {
			const hit = document.elementFromPoint(
				x + width / 2,
				y + height / 2,
			);
			return selectors.find((selector) => hit?.closest(selector));
		},
		{ ...area, selectors: layers },
	);
}

function stackLevels(layers: Locator): Promise<number[]> {
	return layers.evaluateAll((elements) =>
		elements.map((element) => Number(getComputedStyle(element).zIndex)),
	);
}

test.beforeEach(async ({ page }) => {
	await installTauriShim(page);
});

for (const { trigger, url, edge } of MENUS_REACHING_A_TOAST) {
	test(`the open "${trigger}" covers the ${edge} toast it reaches`, async ({
		page,
	}) => {
		await page.goto(url);
		const menu = await openMenu({ page, trigger });
		const toast = await showRestingToast({
			page,
			edge,
			label: TOAST_LABEL,
		});

		const area = await overlap({ first: menu, second: toast });

		expect(await frontLayerIn({ page, area, layers: [MENU, TOAST] })).toBe(
			MENU,
		);
	});
}

test("the safe-area strips stay in front of an open menu and of toasts on both edges", async ({
	page,
}) => {
	await page.goto(DEMO_PROFILE);
	const menu = await openMenu({ page, trigger: "Profile menu" });
	await showRestingToast({ page, edge: "top", label: "Top probe" });
	await showRestingToast({ page, edge: "bottom", label: "Bottom probe" });
	const strips = page.locator(SAFE_AREA_STRIP);

	const stripLevels = await stackLevels(strips);
	const toasterLevels = await stackLevels(page.locator(TOASTER));
	expect(stripLevels).toHaveLength(2);
	expect(toasterLevels).toHaveLength(2);
	expect(Math.max(...toasterLevels)).toBeLessThan(Math.min(...stripLevels));

	const clip = await overlap({ first: menu, second: strips.last() });
	const withMenu = await page.screenshot({ clip, caret: "hide" });
	await page.keyboard.press("Escape");
	await expect(menu).toHaveCount(0);
	const withoutMenu = await page.screenshot({ clip, caret: "hide" });
	expect(
		withMenu.equals(withoutMenu),
		"the strip paints over the part of the menu that reaches it",
	).toBe(true);
});

test("a toast over the report sheet stays in front and takes a tap", async ({
	page,
}) => {
	await page.goto(DEMO_PROFILE);
	const menu = await openMenu({ page, trigger: "Profile menu" });
	await menu.getByRole("menuitem", { name: "Report profile" }).click();
	const sheet = page.locator(DRAWER);
	await sheet.waitFor();
	await animationsFinished(sheet);
	const toast = await showRestingToast({
		page,
		edge: "bottom",
		label: TOAST_LABEL,
	});

	const area = await overlap({ first: sheet, second: toast });
	expect(await frontLayerIn({ page, area, layers: [TOAST, DRAWER] })).toBe(
		TOAST,
	);

	await toast.getByRole("button", { name: "Copy details" }).tap();

	await expect(
		page.getByRole("alertdialog", { name: "Copy error details?" }),
	).toBeVisible();
	await expect(sheet).toHaveAttribute("data-state", "open");
});
