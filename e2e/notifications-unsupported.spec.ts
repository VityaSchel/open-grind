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
const UNSUPPORTED = { platform: "ios", named: "this platform" };

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

		test("an unsupported platform is named in the very middle of the page", async ({
			page,
		}) => {
			await installTauriShim(page, { platform: UNSUPPORTED.platform });
			await page.goto(NOTIFICATIONS);
			await unsupported(page, UNSUPPORTED).waitFor({
				timeout: FIRST_ROUTE_COMPILE_MS,
			});

			const center = await textCenter(page, UNSUPPORTED);

			expect(
				Math.abs(center.x - screen.viewport.width / 2),
			).toBeLessThanOrEqual(1);
			expect(
				Math.abs(center.y - screen.viewport.height / 2),
			).toBeLessThanOrEqual(1);
		});

		test("the message stays in the middle of its page while the page slides in", async ({
			page,
		}) => {
			await openSettings(page, { platform: UNSUPPORTED.platform });
			await openAppSettings(page);

			const sliding = pauseOnceSliding(page, { pane: STACK_PANE });
			await page.getByRole("link", { name: "Notifications" }).click();
			const travelled = await sliding;
			const center = await textCenter(page, UNSUPPORTED);
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
