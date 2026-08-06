import { expect, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const TEST_INSET_PX = 64;

test.describe("screen insets", () => {
	test("the message composer clears the bottom inset", async ({ page }) => {
		await installTauriShim(page);
		await page.goto(DEMO_CONVERSATION);
		const composer = page.locator("div.absolute.right-7.bottom-0").first();
		await composer.waitFor({ timeout: 30_000 });
		await page.waitForTimeout(600);

		const measured = await page.evaluate(() => {
			const el = document.querySelector(
				"div.absolute.right-7.bottom-0",
			) as HTMLElement;
			const inset = getComputedStyle(
				document.documentElement,
			).getPropertyValue("--safe-area-bottom");
			return {
				bottom: Math.round(el.getBoundingClientRect().bottom),
				viewport: window.innerHeight,
				inset: parseFloat(inset) || 0,
			};
		});

		expect(measured.inset, "test insets are active").toBeGreaterThanOrEqual(
			TEST_INSET_PX,
		);
		expect(
			measured.viewport - measured.bottom,
			"composer sits above the bottom inset rather than inside it",
		).toBeGreaterThanOrEqual(measured.inset - 4);
	});

	test("the conversation list clears the bottom inset", async ({ page }) => {
		await installTauriShim(page);
		await page.goto("/chat");
		await page
			.locator('a[href^="/chat/1"]')
			.first()
			.waitFor({ timeout: 30_000 });
		const overflow = await page.evaluate(() => {
			const doc = document.documentElement;
			return doc.scrollHeight - window.innerHeight;
		});
		expect(
			overflow,
			"no page scroll is introduced by the insets",
		).toBeLessThanOrEqual(1);
	});
});

test.describe("keyboard zoom is disabled", () => {
	test("the viewport forbids user scaling", async ({ page }) => {
		await installTauriShim(page);
		await page.goto("/chat");
		const content = await page
			.locator('meta[name="viewport"]')
			.getAttribute("content");
		expect(content).toContain("user-scalable=no");
		expect(content).toContain("maximum-scale=1");
	});

	test("ctrl/cmd +, - and 0 are cancelled instead of zooming", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto("/chat");
		await page
			.locator('a[href^="/chat/1"]')
			.first()
			.waitFor({ timeout: 30_000 });
		const results = await page.evaluate(() =>
			["+", "-", "=", "0"].map((key) => {
				const event = new KeyboardEvent("keydown", {
					key,
					ctrlKey: true,
					bubbles: true,
					cancelable: true,
				});
				window.dispatchEvent(event);
				return { key, prevented: event.defaultPrevented };
			}),
		);
		for (const { key, prevented } of results) {
			expect(prevented, `ctrl+${key} is blocked`).toBe(true);
		}
	});
});
