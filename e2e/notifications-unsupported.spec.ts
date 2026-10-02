import { expect, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import {
	openAppSettings,
	openSettings,
	pane,
	stackSettled,
} from "./support/page-stack";
import {
	cancelSystemBack,
	progressSystemBack,
	startSystemBack,
} from "./support/system-back";

const NOTIFICATIONS = "/settings/app/notifications";
const SCREENS = [
	{ name: "a 420 × 800 phone", viewport: { width: 420, height: 800 } },
	{ name: "a 1040 × 800 desktop", viewport: { width: 1040, height: 800 } },
];
const DESKTOPS = [
	{ platform: "macos", named: "macOS" },
	{ platform: "windows", named: "Windows" },
	{ platform: "linux", named: "Linux" },
];

test.describe.configure({ timeout: 180_000 });

const unsupported = (page: Page, named: string) =>
	page.getByText(`Notifications are not supported on ${named} yet.`);

const textCenter = (page: Page, named: string) =>
	unsupported(page, named).evaluate((message) => {
		const text = document.createRange();
		text.selectNodeContents(message);
		const { left, right, top, bottom } = text.getBoundingClientRect();
		return { x: (left + right) / 2, y: (top + bottom) / 2 };
	});

for (const screen of SCREENS) {
	test.describe(`on ${screen.name}`, () => {
		test.use({ viewport: screen.viewport });

		for (const { platform, named } of DESKTOPS) {
			test(`${named} is named as unsupported in the very middle of the page`, async ({
				page,
			}) => {
				await installTauriShim(page, { platform });
				await page.goto(NOTIFICATIONS);
				await unsupported(page, named).waitFor({
					timeout: FIRST_ROUTE_COMPILE_MS,
				});

				const center = await textCenter(page, named);

				expect(
					Math.abs(center.x - screen.viewport.width / 2),
				).toBeLessThanOrEqual(1);
				expect(
					Math.abs(center.y - screen.viewport.height / 2),
				).toBeLessThanOrEqual(1);
			});
		}

		test("the message stays in the middle of its page while the page is dragged back", async ({
			page,
		}) => {
			await openSettings(page);
			await openAppSettings(page);
			await page.getByRole("link", { name: "Notifications" }).click();
			await expect(page).toHaveURL(new RegExp(`${NOTIFICATIONS}$`));
			await stackSettled(page);

			expect(await startSystemBack(page)).toBe(true);
			await progressSystemBack(page, 0.5);
			const dragged = (await pane(page).boundingBox())!.x;
			const center = await textCenter(page, "macOS");
			await cancelSystemBack(page);

			expect(dragged).toBeCloseTo(screen.viewport.width / 2, 0);
			expect(
				Math.abs(center.x - dragged - screen.viewport.width / 2),
			).toBeLessThanOrEqual(1);
			expect(
				Math.abs(center.y - screen.viewport.height / 2),
			).toBeLessThanOrEqual(1);
		});
	});
}
