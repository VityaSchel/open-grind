import { expect, test } from "@playwright/test";

import {
	BUTTON_ROW_PX,
	CONVERSATION_ROW,
	CONVERSATIONS_SCROLLER,
	driveInOneGesture,
	openInbox,
	refreshButton,
	topOf,
} from "./support/pull";

const SHALLOW_PX = 8;
const PAST_ARM_PX = 26;
const BAND_STEP_MS = 50;
const WOULD_HAVE_REFRESHED_MS = 300;
const STALE_KEY_MS = 600;

test.describe("refreshing without a pull", () => {
	test("a rubber band that no wheel comes with is still a pull and offers no Refresh button", async ({
		page,
	}) => {
		await openInbox(page);

		await driveInOneGesture(
			page,
			[],
			`
			spring(${SHALLOW_PX}); await sleep(${BAND_STEP_MS});
			return {};
		`,
		);

		await expect(
			page.getByText("Pull to refresh", { exact: true }),
		).toBeVisible();
		await expect(refreshButton(page)).toBeHidden();
	});

	test("a rubber band that a scroll key drives offers the Refresh button without ever pulling, and the next band brings the hint back", async ({
		page,
	}) => {
		await openInbox(page);
		const phases = await page
			.locator("[data-refresh-phase]")
			.evaluateHandle((control: HTMLElement) => {
				const seen = new Set<string | undefined>();
				const sample = () => {
					seen.add(control.dataset.refreshPhase);
					requestAnimationFrame(sample);
				};
				requestAnimationFrame(sample);
				return seen;
			});

		await driveInOneGesture(
			page,
			[],
			`
			scrollKey("PageUp");
			spring(${SHALLOW_PX}); await sleep(${BAND_STEP_MS});
			spring(${PAST_ARM_PX}); await sleep(${BAND_STEP_MS});
			lift();
			spring(0); await sleep(${WOULD_HAVE_REFRESHED_MS});
			return {};
		`,
		);

		await expect(refreshButton(page)).toBeVisible();
		expect(await phases.evaluate((seen) => [...seen])).toEqual(["idle"]);

		await driveInOneGesture(
			page,
			[],
			`
			await sleep(${STALE_KEY_MS});
			spring(${SHALLOW_PX}); await sleep(${BAND_STEP_MS});
			return {};
		`,
		);

		await expect(
			page.getByText("Pull to refresh", { exact: true }),
		).toBeVisible();
		await expect(refreshButton(page)).toBeHidden();
		expect(await phases.evaluate((seen) => [...seen])).toEqual([
			"idle",
			"pulling",
		]);
	});

	test("an arrow key pressed toward the top of a list that is already there offers the Refresh button in a row of its own", async ({
		page,
	}) => {
		await openInbox(page);
		const firstRow = page.locator(CONVERSATION_ROW).first();
		const restingTop = await topOf(firstRow);
		await firstRow.focus();

		await page.keyboard.press("ArrowUp");

		await expect(refreshButton(page)).toBeVisible();
		await expect
			.poll(() => topOf(firstRow))
			.toBe(restingTop + BUTTON_ROW_PX);
	});

	test("the Refresh button a key press offers is the tab stop right before the list, and Enter refreshes from it", async ({
		page,
	}) => {
		await openInbox(page);
		await page
			.locator(CONVERSATIONS_SCROLLER)
			.getByRole("link")
			.first()
			.focus();
		await page.keyboard.press("ArrowUp");
		await expect(refreshButton(page)).toBeVisible();

		await page.keyboard.press("Shift+Tab");
		await expect(refreshButton(page)).toBeFocused();

		await page.keyboard.press("Enter");
		await expect(
			page.locator("[data-refresh-disc][data-spinning]"),
		).toBeVisible();
	});
});
