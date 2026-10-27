import { expect, test } from "@playwright/test";

import { DEV_SERVER_URL } from "../playwright.config";
import { installTauriShim } from "./support/app";
import { AVATAR_HOST, serveImages } from "./support/media";

test.use({ baseURL: DEV_SERVER_URL });

test("opening a profile before chat keeps its reply composer interactive", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await serveImages(page, AVATAR_HOST);
	await installTauriShim(page);
	await page.goto("/profile/100001");
	await page.getByRole("link", { name: /Profile photo 1 of/ }).click();
	const reply = page.getByRole("textbox", { name: "Reply to profile photo" });
	await expect(reply).toBeEnabled();
	const touchActions = await reply.evaluate((input) => {
		const actions: string[] = [];
		for (
			let node: Element | null = input;
			node;
			node = node.parentElement
		) {
			actions.push(getComputedStyle(node).touchAction);
			if (node.classList.contains("pswp")) break;
		}
		return actions;
	});
	expect(touchActions.every((action) => action === "auto")).toBe(true);
	await expect(page.locator(".pswp__scroll-wrap")).toHaveCSS(
		"touch-action",
		"none",
	);
	await expect(page.locator(".pswp__reply-composer")).toHaveCSS(
		"pointer-events",
		"none",
	);
	await expect(page.locator(".pswp__reply-composer form")).toHaveCSS(
		"pointer-events",
		"auto",
	);
	await reply.click();
	await expect(reply).toBeFocused();
	await reply.pressSequentially("Hello from your photo");
	await expect(reply).toHaveValue("Hello from your photo");
});
