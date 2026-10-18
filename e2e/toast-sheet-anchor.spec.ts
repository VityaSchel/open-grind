import { expect, type Page, test } from "@playwright/test";

import {
	afterTwoFrames,
	animationsFinished,
	DEMO_CONVERSATION,
	installTauriShim,
} from "./support/app";
import { DRAWER, scrollSheetTo, SHEET_PANEL } from "./support/drawer";
import { openStickers } from "./support/stickers";
import {
	bottomToaster,
	showRestingToast,
	TOAST_GAP_PX,
	toastGap,
} from "./support/toast";

const RAISED_BOTTOM_INSET_PX = 120;

const composer = (page: Page) => page.locator('[data-slot="message-composer"]');
const sheetPanel = (page: Page) => page.locator(DRAWER).locator(SHEET_PANEL);

async function settled(page: Page): Promise<void> {
	await animationsFinished(bottomToaster(page));
	await afterTwoFrames(page);
}

test("a toast rides 8px above an open sheet and pins under the status bar once the sheet fills the screen", async ({
	page,
}) => {
	await openStickers(page, { stretchPanel: false });

	const collapsed = await showRestingToast({
		page,
		edge: "bottom",
		label: "Collapsed probe",
	});
	await settled(page);
	expect(
		await toastGap({
			toast: collapsed,
			obstruction: sheetPanel(page),
			edge: "bottom",
		}),
	).toBeCloseTo(TOAST_GAP_PX, 0);

	await scrollSheetTo(page, { top: 1500 });
	const expanded = await showRestingToast({
		page,
		edge: "bottom",
		label: "Expanded probe",
	});
	await settled(page);
	const safeTop = await page.evaluate(() =>
		Number.parseFloat(
			getComputedStyle(document.documentElement).getPropertyValue(
				"--safe-area-top",
			),
		),
	);
	const stackTops = await page
		.locator("[data-sonner-toast]")
		.evaluateAll((toasts) =>
			toasts.map((toast) => toast.getBoundingClientRect().top),
		);
	expect(stackTops).toHaveLength(2);
	expect(
		Math.min(...stackTops),
		"the whole stack pins under the status bar, its oldest toast on top",
	).toBeCloseTo((safeTop || 0) + TOAST_GAP_PX, 0);
	expect((await expanded.boundingBox())!.y).toBeGreaterThan(
		Math.min(...stackTops),
	);

	await scrollSheetTo(page, { top: 0 });
	const back = await showRestingToast({
		page,
		edge: "bottom",
		label: "Collapsed again probe",
	});
	await settled(page);
	expect(
		await toastGap({
			toast: back,
			obstruction: sheetPanel(page),
			edge: "bottom",
		}),
	).toBeCloseTo(TOAST_GAP_PX, 0);
});

test("the last toast leaving over an open sheet stays above the sheet", async ({
	page,
}) => {
	await openStickers(page, { stretchPanel: false });
	const toast = await showRestingToast({
		page,
		edge: "bottom",
		label: "Leaving probe",
	});
	await settled(page);

	await bottomToaster(page).evaluate((toaster) =>
		toaster.style.setProperty("--front-toast-height", "undefinedpx"),
	);
	await afterTwoFrames(page);

	expect(
		await toastGap({
			toast,
			obstruction: sheetPanel(page),
			edge: "bottom",
		}),
		"sonner's front height goes invalid while the last toast leaves",
	).toBeCloseTo(TOAST_GAP_PX, 0);
});

test("a toast glides back above the composer when the sheet closes", async ({
	page,
}) => {
	await openStickers(page, { stretchPanel: false });
	const toast = await showRestingToast({
		page,
		edge: "bottom",
		label: "Closing probe",
	});
	await settled(page);

	await page.keyboard.press("Escape");
	await expect(page.locator(DRAWER)).toHaveCount(0);
	await settled(page);

	expect(
		await toastGap({ toast, obstruction: composer(page), edge: "bottom" }),
	).toBeCloseTo(TOAST_GAP_PX, 0);
});

test("an offset change glides the toasts to their new place instead of jumping", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await composer(page).waitFor({ timeout: 60_000 });
	await showRestingToast({ page, edge: "bottom", label: "Offset probe" });

	const transition = await bottomToaster(page).evaluate((toaster, bottom) => {
		const insets = window.__AndroidInsets;
		if (!insets) throw new Error("Test insets are off");
		const before = toaster.getBoundingClientRect().top;
		insets.bottom = () => bottom;
		window.__reapplyInsets();
		return new Promise<{ gliding: boolean; firstFrameMovedPx: number }>(
			(measured) =>
				requestAnimationFrame(() =>
					measured({
						gliding: toaster
							.getAnimations()
							.some(
								(animation) =>
									animation instanceof CSSTransition &&
									animation.transitionProperty === "bottom",
							),
						firstFrameMovedPx: Math.abs(
							toaster.getBoundingClientRect().top - before,
						),
					}),
				),
		);
	}, RAISED_BOTTOM_INSET_PX);

	expect(transition.gliding).toBe(true);
	expect(transition.firstFrameMovedPx).toBeLessThan(
		RAISED_BOTTOM_INSET_PX / 2,
	);
	await settled(page);
	const resting = page.locator('[data-sonner-toast][data-front="true"]');
	expect(
		await toastGap({
			toast: resting,
			obstruction: composer(page),
			edge: "bottom",
		}),
	).toBeCloseTo(TOAST_GAP_PX, 0);
});
