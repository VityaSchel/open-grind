import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const BELOW_CARD_PX = 40;
const TOAST = "[data-sonner-toast]";
const TOASTS_MODULE_URL = "/src/lib/updates/toasts.ts";

async function showPinnedToast(
	page: Page,
	{ reporting = false } = {},
): Promise<void> {
	await expect
		.poll(async () => {
			await page.evaluate(
				async ({ module, report }) => {
					const toasts = await import(/* @vite-ignore */ module);
					const activation = (
						window as unknown as { recordActivation?: () => void }
					).recordActivation;
					toasts.showStage({
						view: { stage: "ready", received: 1, total: 1 },
						onActivate: () => report && activation?.(),
						onCancel: () => {},
						onDismiss: () => {},
					});
				},
				{ module: TOASTS_MODULE_URL, report: reporting },
			);
			return page.locator(TOAST).count();
		})
		.toBeGreaterThan(0);
}

test.describe("a toast that cannot be swiped away", () => {
	test.beforeEach(async ({ page }) => {
		await installTauriShim(page);
		await page.goto("/");
		await showPinnedToast(page);
	});

	test("never latches the swipe state that widens its hit area", async ({
		page,
	}) => {
		const card = page.locator(TOAST);
		await card.tap();

		await expect(card).toHaveAttribute("data-swiping", "false");
	});

	test("leaves the page below it tappable after being tapped", async ({
		page,
	}) => {
		const card = page.locator(TOAST);
		await card.tap();

		const swallowed = await page.evaluate((below) => {
			const toast = document.querySelector("[data-sonner-toast]");
			if (!toast) return "no toast";
			const box = toast.getBoundingClientRect();
			const probes = [window.innerWidth / 2, 2, window.innerWidth - 2];
			return probes
				.map((x) => document.elementFromPoint(x, box.bottom + below))
				.some((hit) => hit && toast.contains(hit));
		}, BELOW_CARD_PX);

		expect(swallowed).toBe(false);
	});

	test("still takes a tap on the card itself", async ({ page }) => {
		let activated = 0;
		await page.exposeFunction("recordActivation", () => (activated += 1));
		await showPinnedToast(page, { reporting: true });

		await page.locator(TOAST).tap();

		await expect.poll(() => activated).toBe(1);
	});
});
