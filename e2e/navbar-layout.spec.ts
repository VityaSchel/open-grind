import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

test.use({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 });

test("the bottom navbar fits a 1080px physical-width screen", async ({
	page,
}) => {
	await installTauriShim(page);
	await page.goto("/right-now");

	const navbar = page.getByRole("navigation");
	const links = navbar.locator(".links");
	const rightNow = navbar.getByRole("link", { name: "Right Now" });
	await expect(rightNow).toHaveAttribute("data-active", "true");

	const layout = await links.evaluate((linksElement) => {
		const content = linksElement.parentElement;
		const avatar = content?.querySelector('a[aria-label="Me"]');
		if (!content || !avatar) throw new Error("Navbar structure not found");

		const bounds = (element: Element) => {
			const rect = element.getBoundingClientRect();
			return { left: rect.left, right: rect.right };
		};

		return {
			cssViewportWidth: window.innerWidth,
			physicalViewportWidth: window.innerWidth * window.devicePixelRatio,
			clientWidth: content.clientWidth,
			scrollWidth: content.scrollWidth,
			links: bounds(linksElement),
			avatar: bounds(avatar),
		};
	});

	expect(layout.cssViewportWidth).toBe(360);
	expect(layout.physicalViewportWidth).toBe(1080);
	expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
	for (const bounds of [layout.links, layout.avatar]) {
		expect(bounds.left).toBeGreaterThanOrEqual(0);
		expect(bounds.right).toBeLessThanOrEqual(layout.cssViewportWidth);
	}
});

test.describe("in a 308 × 404 pop-up window", () => {
	test.use({ viewport: { width: 308, height: 404 } });

	test("the bottom navbar scrolls to both of its ends", async ({ page }) => {
		await installTauriShim(page);
		await page.goto("/right-now");

		const links = page.getByRole("navigation").locator(".links");
		await expect(links).toBeVisible();

		const ends = await links.evaluate((linksElement) => {
			const content = linksElement.parentElement;
			const avatar = content?.querySelector('a[aria-label="Me"]');
			if (!content || !avatar)
				throw new Error("Navbar structure not found");

			content.scrollLeft = 0;
			const atStart = {
				content: content.getBoundingClientRect().left,
				links: linksElement.getBoundingClientRect().left,
			};
			content.scrollLeft = content.scrollWidth;
			const atEnd = {
				content: content.getBoundingClientRect().right,
				avatar: avatar.getBoundingClientRect().right,
			};
			return {
				overflow: content.scrollWidth - content.clientWidth,
				atStart,
				atEnd,
			};
		});

		expect(ends.overflow).toBeGreaterThan(0);
		expect(ends.atStart.links).toBeGreaterThanOrEqual(ends.atStart.content);
		expect(ends.atEnd.avatar).toBeLessThanOrEqual(ends.atEnd.content);
	});
});

test.describe("on a 412 × 920 phone with 64 px system bars", () => {
	test.use({ viewport: { width: 412, height: 920 } });

	test("the Me screen fits without scrolling", async ({ page }) => {
		await installTauriShim(page);
		await page.goto("/settings");
		const scroller = page.locator('[data-slot="me-scroller"]');
		await expect(
			scroller.getByRole("button", { name: "Sign out" }),
		).toBeVisible();
		await page.waitForLoadState("networkidle");

		expect(
			await scroller.evaluate((el) => el.scrollHeight - el.clientHeight),
		).toBeLessThanOrEqual(0);
	});
});
