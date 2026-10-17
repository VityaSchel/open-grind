import { expect, type Locator, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";
import { showRestingToast } from "./support/toast";

const TOAST_GAP_PX = 8;
const RAISED_BOTTOM_INSET_PX = 120;

const composer = (page: Page) => page.locator('[data-slot="message-composer"]');
const bottomToaster = (page: Page) =>
	page.locator('[data-sonner-toaster][data-y-position="bottom"]');

function settled(page: Page): Promise<void> {
	return bottomToaster(page).evaluate(
		(toaster) =>
			new Promise<void>((done) => {
				void Promise.all(
					toaster.getAnimations().map(({ finished }) => finished),
				).then(() =>
					requestAnimationFrame(() =>
						requestAnimationFrame(() => done()),
					),
				);
			}),
	);
}

async function gapAbove({
	toast,
	edge,
}: {
	toast: Locator;
	edge: Locator;
}): Promise<number> {
	const toastBox = (await toast.boundingBox())!;
	const edgeBox = (await edge.boundingBox())!;
	return edgeBox.y - (toastBox.y + toastBox.height);
}

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
		await gapAbove({ toast: resting, edge: composer(page) }),
	).toBeCloseTo(TOAST_GAP_PX, 0);
});
