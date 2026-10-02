import { expect, type Page, test } from "@playwright/test";

import { FIRST_ROUTE_COMPILE_MS, installTauriShim } from "./support/app";
import {
	openAppSettings,
	openSettings,
	STACK_PANE,
	stackSettled,
} from "./support/page-stack";
import { pauseOnceSliding, resumeSlides } from "./support/stack-layers";

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

const unsupported = (page: Page, { named }: { named: string }) =>
	page.getByText(`Notifications are not supported on ${named} yet.`);

const textCenter = (page: Page, { named }: { named: string }) =>
	unsupported(page, { named }).evaluate((message) => {
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
				await unsupported(page, { named }).waitFor({
					timeout: FIRST_ROUTE_COMPILE_MS,
				});

				const center = await textCenter(page, { named });

				expect(
					Math.abs(center.x - screen.viewport.width / 2),
				).toBeLessThanOrEqual(1);
				expect(
					Math.abs(center.y - screen.viewport.height / 2),
				).toBeLessThanOrEqual(1);
			});
		}

		test("the message stays in the middle of its page while the page slides in", async ({
			page,
		}) => {
			await openSettings(page, { platform: "windows" });
			await openAppSettings(page);

			const sliding = pauseOnceSliding(page, { pane: STACK_PANE });
			await page.getByRole("link", { name: "Notifications" }).click();
			const travelled = await sliding;
			const center = await textCenter(page, { named: "Windows" });
			await resumeSlides(page);
			await stackSettled(page);

			expect(travelled).toBeGreaterThan(0);
			expect(
				Math.abs(center.x - travelled - screen.viewport.width / 2),
			).toBeLessThanOrEqual(1);
			expect(
				Math.abs(center.y - screen.viewport.height / 2),
			).toBeLessThanOrEqual(1);
		});
	});
}
