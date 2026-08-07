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
